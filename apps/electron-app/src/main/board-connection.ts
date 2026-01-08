import {
	BOARDS,
	Flasher,
	getConnectedPorts,
	UnableToOpenSerialConnection,
	type BoardName,
	type PortInfo,
} from '@microflow/flasher';
import type { Edge, Node } from '@xyflow/react';
import { fork, ChildProcess } from 'child_process';
import { sendMessageToRenderer } from './window';
import { Board, IpcResponse, UploadedCodeMessage } from '../common/types';
import { getRandomMessage } from '../common/messages';
import log from 'electron-log/node';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import {
	PortDisconnectedError,
	getConnectedPort,
	setConnectedPort,
	getKnownBoardsWithPorts,
	acquirePortOperationLock,
} from './port-manager';
import { Timer } from './utils';

const ipRegex = new RegExp(
	/^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/
);

let runnerProcess: ChildProcess | undefined;
let lastUsedPinsHash: string | null = null;
let lastFlow: { nodes: Node[]; edges: Edge[]; ip?: string } | null = null;

/**
 * Gets the current runner process
 */
export function getRunnerProcess(): ChildProcess | undefined {
	return runnerProcess;
}

/**
 * Kills the runner process and clears the connected port
 */
export async function killRunnerProcess() {
	runnerProcess?.kill('SIGKILL');
	runnerProcess = undefined;
	setConnectedPort(undefined);
	await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for the process to die
}

async function checkPortError(error: unknown, portPath: string, context: string = 'operation') {
	if (error instanceof PortDisconnectedError) {
		throw error;
	}

	// Check if it's a port-related error
	const isPortError =
		error instanceof UnableToOpenSerialConnection ||
		(error instanceof Error &&
			(error.message.includes('No such file or directory') ||
				error.message.includes('cannot open')));

	if (isPortError) {
		const ports = await getConnectedPorts();
		const portStillExists = ports.find(p => p.path === portPath);

		if (!portStillExists) {
			throw new PortDisconnectedError(portPath, `Port ${portPath} disconnected during ${context}`);
		}
	}

	// If port still exists or it's not a port error, let the original error propagate
}

/**
 * Checks if pins have changed between flow executions
 */
async function didPinsChange(nodes: Node[]) {
	const pins = nodes
		.map(node => {
			if ('pins' in node.data) return Object.values(node.data.pins as Record<string, unknown>);
			if ('pin' in node.data) return [node.data.pin];
		})
		.flat();

	// TODO: this can be a bit more efficient
	// E.g., If we add new pins, it is okay.
	const pinsHash = pins.sort().join(',');
	if (!lastUsedPinsHash || pinsHash === lastUsedPinsHash) return false;
	lastUsedPinsHash = pinsHash;
	return true;
}

export async function ensureRunnerProcess(nodes: Node[], edges: Edge[], ip?: string) {
	// Store the flow for later use (e.g., after flashing)
	lastFlow = { nodes, edges, ip };

	if (!runnerProcess) return startRunnerProcess(ip);

	if (await didPinsChange(nodes)) {
		sendMessageToRenderer<Board>('ipc-board', {
			success: true,
			data: { type: 'info', message: 'Reconfiguring microcontroller...' },
		});
		await killRunnerProcess();
		await startRunnerProcess(ip);
	}
}

/**
 * Sends the flow to the runner process
 * This is the shared logic used by both the IPC handler and the ready handler
 */
export async function sendFlowToRunner(nodes: Node[], edges: Edge[], timer?: Timer) {
	const flowTimer = timer || new Timer();
	const runnerProcess = getRunnerProcess();

	log.debug(
		'[FLOW] <send>',
		runnerProcess?.pid,
		JSON.stringify(nodes, null, 2),
		JSON.stringify(edges, null, 2),
		flowTimer.duration
	);

	if (!runnerProcess) return;

	runnerProcess.send({ type: 'flow', nodes, edges });
}

/**
 * Gets the current connection state
 * Returns the board state if connected, or null if not connected
 */
export function getCurrentConnectionState(): Board | null {
	const connectedPort = getConnectedPort();
	const runnerProcess = getRunnerProcess();

	// If we have a connected port and runner process, verify they're still valid
	if (connectedPort && runnerProcess) {
		// Check if runner process is still alive
		if (!runnerProcess.killed && runnerProcess.exitCode === null) {
			// Runner is still running, return connect state
			log.debug('[STATE] <get>', 'Port and runner process exist', connectedPort.path);
			return {
				type: 'ready',
				port: connectedPort.path,
				message: 'Board connected',
			};
		} else {
			// Runner process died, clear the connection
			log.debug('[STATE] <get>', 'Runner process died, clearing connection');
			setConnectedPort(undefined);
			return null;
		}
	} else if (connectedPort && !runnerProcess) {
		// Port is set but no runner process - might need to reconnect
		log.debug('[STATE] <get>', 'Port exists but no runner process', connectedPort.path);
		return {
			type: 'ready',
			port: connectedPort.path,
			message: 'Reconnecting to board',
		};
	} else {
		// No connection state
		log.debug('[STATE] <get>', 'No connection state');
		return null;
	}
}

export async function startRunnerProcess(ip?: string) {
	const timer = new Timer();

	const boardOverIp: Awaited<ReturnType<typeof getKnownBoardsWithPorts>> = [
		['BOARD_OVER_IP' as BoardName, [{ path: ip ?? '' } as PortInfo]],
	];

	const boardsAndPorts = ip ? boardOverIp : await getKnownBoardsWithPorts();

	if (!boardsAndPorts.length) {
		sendMessageToRenderer<Board>('ipc-board', {
			success: true,
			data: { type: 'close', message: 'No boards found' },
		});
		return;
	}

	checkBoard: for (const [board, ports] of boardsAndPorts) {
		for (const port of ports) {
			log.debug('[CHECK] <start>', board, port.path, timer.duration);

			try {
				sendMessageToRenderer<Board>('ipc-board', {
					success: true,
					data: { type: 'info', port: port.path, message: `Connecting to ${port.path}` },
				});

				await checkBoardOnPort(port, board);
				setConnectedPort(port);
				log.debug(`[CHECK] <connected> ${port.path}`, timer.duration);
				break checkBoard;
			} catch (error) {
				await killRunnerProcess();

				// If port was disconnected, skip it and continue checking other ports
				if (error instanceof PortDisconnectedError) {
					log.warn('[CHECK] <port-disconnected>', board, port.path, error.message);
					sendMessageToRenderer<Board>('ipc-board', {
						success: true,
						data: { type: 'info', message: `${port.path} disconnected, checking other boards...` },
					});
					continue; // Continue to next port
				}

				log.warn('[CHECK] <error>', board, port.path, error);
				sendMessageToRenderer<Board>('ipc-board', {
					success: true,
					data: { type: 'info', message: (error as any).message ?? getRandomMessage('wait') },
				});
			}
		}
	}

	if (!getConnectedPort()) {
		sendMessageToRenderer<Board>('ipc-board', {
			success: true,
			data: { type: 'warn', message: 'Unable to connect to board' },
		});
		sendMessageToRenderer<Board>('ipc-board', {
			success: true,
			data: { type: 'close', message: 'No board found' },
		});
		return;
	}
}

async function checkBoardOnPort(port: Pick<PortInfo, 'path'>, board: BoardName) {
	await killRunnerProcess();

	// Acquire lock to prevent port polling during connection attempt
	const releaseLock = acquirePortOperationLock();

	const timer = new Timer();
	const filePath = join(__dirname, 'workers', 'runner.js');

	return new Promise((resolve, reject) => {
		log.debug('[RUNNER] <create>', filePath, timer.duration);
		runnerProcess = fork(filePath, [port.path], {
			// serviceName: 'Microflow studio - microcontroller validator',
			stdio: 'pipe',
		});

		let isResolved = false;
		let portCheckInterval: NodeJS.Timeout | null = null;

		// Helper function to clean up connection-related resources (but keep message handler active)
		const cleanupConnectionResources = () => {
			if (portCheckInterval) {
				clearInterval(portCheckInterval);
				portCheckInterval = null;
			}
			if (runnerProcess) {
				// Only remove exit/error handlers that are specific to connection phase
				// Keep message handler active for runtime messages (it handles both connection and runtime)
				runnerProcess.off('exit', handleExit);
				runnerProcess.off('error', handleError);
			}
			// Release the lock when cleanup is called
			releaseLock();
		};

		// Full cleanup - removes all handlers (used when process is killed or on fatal errors)
		const fullCleanup = () => {
			cleanupConnectionResources();
			if (runnerProcess) {
				// Remove message handler only on fatal errors/kill
				runnerProcess.off('message', handleMessage);
			}
		};

		const rejectWithCleanup = (error: Error) => {
			if (isResolved) return;
			isResolved = true;
			fullCleanup();
			reject(error);
		};

		const resolveWithCleanup = (value: any) => {
			if (isResolved) return;
			isResolved = true;
			// On successful connection, only clean up connection resources
			// Keep message handler active - it handles both connection and runtime messages
			cleanupConnectionResources();
			resolve(value);
		};

		// Periodically check if the port still exists while waiting for connection
		const checkPortExists = async () => {
			if (isResolved) return;

			try {
				const ports = await getConnectedPorts();
				const portStillExists = ports.find(p => p.path === port.path);

				if (!portStillExists) {
					log.warn('[RUNNER] <port-disconnected-during-connection>', port.path, timer.duration);
					rejectWithCleanup(
						new PortDisconnectedError(
							port.path,
							`Port ${port.path} disconnected during connection attempt`
						)
					);
				}
			} catch (error) {
				log.warn('[RUNNER] <port-check-error>', error);
				// Don't reject on check error, just log it
			}
		};

		// Start periodic port checking (every 500ms)
		portCheckInterval = setInterval(checkPortExists, 500);

		runnerProcess.on('spawn', () => {
			log.debug('[RUNNER] <spawn>', runnerProcess?.pid, timer.duration);
		});

		runnerProcess.stderr?.on('data', async data => {
			log.debug('[RUNNER] <stderr>', runnerProcess?.pid, timer.duration, data.toString());
			sendMessageToRenderer<Board>('ipc-board', {
				success: false,
				error: data.toString(),
			});
		});

		runnerProcess.stdout?.on('data', async data => {
			// log.debug('[RUNNER] <stdout>', runnerProcess?.pid, timer.duration, data.toString());
		});

		// Handle runner process exit (might happen if port disconnects)
		const handleExit = async (code: number | null, signal: string | null) => {
			if (isResolved) return;

			log.warn('[RUNNER] <exit>', runnerProcess?.pid, code, signal, timer.duration);

			// Check if port still exists when process exits unexpectedly
			try {
				await checkPortExists();
				// If port still exists, it was a different error
				if (!isResolved) {
					rejectWithCleanup(
						new Error(`Runner process exited unexpectedly (code: ${code}, signal: ${signal})`)
					);
				}
			} catch (error) {
				// Port check already rejected, nothing to do
			}
		};

		// Handle runner process errors
		const handleError = (error: Error) => {
			if (isResolved) return;
			log.warn('[RUNNER] <process-error>', runnerProcess?.pid, error, timer.duration);
			rejectWithCleanup(error);
		};

		runnerProcess.on('exit', handleExit);
		runnerProcess.on('error', handleError);

		async function handleMessage(data: Board | UploadedCodeMessage) {
			// log.debug('[RUNNER] <message>', runnerProcess?.pid, data.type, timer.duration);
			try {
				switch (data.type) {
					case 'message':
						sendMessageToRenderer<UploadedCodeMessage>('ipc-microcontroller', {
							success: true,
							data: data,
						});
						break;
					case 'error':
						log.warn(`[RUNNER] <${data.type}>`, runnerProcess?.pid, data.message, timer.duration);
						let notificationTimeout: NodeJS.Timeout | null = null;
						try {
							if (ipRegex.test(port.path)) {
								return rejectWithCleanup(new Error(data.message ?? 'Unknown error'));
							}

							// Prevents double error messages from causing multiple flashers
							runnerProcess?.off('message', handleMessage);

							notificationTimeout = setTimeout(() => {
								sendMessageToRenderer<Board>('ipc-board', {
									success: true,
									data: {
										type: 'info',
										message: getRandomMessage('wait'),
									},
								} satisfies IpcResponse<Board>);
							}, 7500);
							await flashFirmataToBoard(board, port);
							// Recursively call checkBoardOnPort and chain the result to this Promise
							checkBoardOnPort(port, board)
								.then(result => resolveWithCleanup(result))
								.catch(error => rejectWithCleanup(error));
							return; // Exit early, Promise will be resolved/rejected by the recursive call
						} catch (error) {
							// Re-register handler in case process is still running after error
							// This prevents unhandled messages if flashing fails or recursive call rejects
							if (runnerProcess && !runnerProcess.killed && runnerProcess.exitCode === null) {
								runnerProcess.on('message', handleMessage);
							}
							try {
								await checkPortError(error, port.path, 'flashing');
								// Port still exists or not a port error - reject with original error
								rejectWithCleanup(error as Error);
							} catch (portError) {
								// Port disconnected or already PortDisconnectedError - reject with port error
								rejectWithCleanup(portError as Error);
							}
						} finally {
							if (notificationTimeout) clearTimeout(notificationTimeout);
						}
						break;
					case 'close':
					case 'exit':
					case 'fail':
						log.warn(`[RUNNER] <${data.type}>`, runnerProcess?.pid, data.message, timer.duration);
						rejectWithCleanup(new Error(data.message ?? 'Unknown error'));
						break;
					case 'ready':
						log.debug(`[RUNNER] <${data.type}>`, runnerProcess?.pid, timer.duration);
						sendMessageToRenderer<Board>('ipc-board', {
							success: true,
							data: { type: 'ready', port: port.path, pins: data.pins },
						});
						resolveWithCleanup(null);
						sendFlowToRunner(lastFlow?.nodes ?? [], lastFlow?.edges ?? [], timer);
						break;
				}
			} catch (e) {
				rejectWithCleanup(e as Error);
			}
		}

		// Register connection-phase message handler
		runnerProcess.on('message', handleMessage);
	});
}

/**
 * Waits for a port to appear in the list of connected ports
 * @param portPath The path of the port to wait for
 * @param timeoutMs Maximum time to wait in milliseconds (default: 10000)
 * @param checkIntervalMs How often to check in milliseconds (default: 500)
 * @returns Promise that resolves when the port is found, or rejects on timeout
 */
async function waitForPortToReappear(
	portPath: string,
	timeoutMs: number = 10000,
	checkIntervalMs: number = 500
): Promise<void> {
	const startTime = Date.now();

	return new Promise((resolve, reject) => {
		const checkPort = async () => {
			try {
				const ports = await getConnectedPorts();
				const portFound = ports.find(p => p.path === portPath);

				if (portFound) {
					log.debug('[FLASH] <port-reappeared>', portPath, Date.now() - startTime);
					resolve();
					return;
				}

				// Check if we've exceeded the timeout
				if (Date.now() - startTime >= timeoutMs) {
					reject(
						new Error(`Port ${portPath} did not reappear within ${timeoutMs}ms after flashing`)
					);
					return;
				}

				// Schedule next check
				setTimeout(checkPort, checkIntervalMs);
			} catch (error) {
				reject(error);
			}
		};

		// Start checking immediately
		checkPort();
	});
}

async function flashFirmataToBoard(board: BoardName, port: Pick<PortInfo, 'path'>) {
	const flashTimer = new Timer();

	const firmataPath = resolve(__dirname, 'hex', board, 'StandardFirmata.ino.hex');

	// Check if file exists
	if (!existsSync(firmataPath)) {
		log.error('[FLASH] <error>', 'Firmata file not found', firmataPath);
		throw new Error(`[FLASH] Firmata file not found at ${firmataPath}`);
	}

	await killRunnerProcess();
	log.debug('[FLASH] <start>', firmataPath, board, port.path, flashTimer.duration);

	// Acquire lock to prevent port polling during flashing
	const releaseLock = acquirePortOperationLock();

	// Store the port path before flashing (it may disappear during flashing)
	const portPath = port.path;
	const portDisappearedDuringFlash = { value: false };

	return new Promise(async (resolve, reject) => {
		let portCheckInterval: NodeJS.Timeout | null = null;
		let flashTimeout: NodeJS.Timeout | null = null;

		const cleanup = () => {
			if (flashTimeout) {
				clearTimeout(flashTimeout);
				flashTimeout = null;
			}
			if (portCheckInterval) {
				clearInterval(portCheckInterval);
				portCheckInterval = null;
			}
			// Release the lock when cleanup is called
			releaseLock();
		};

		// Set up a timeout to prevent freezing if flashing takes too long
		flashTimeout = setTimeout(() => {
			log.error('[FLASH] <timeout>', portPath, flashTimer.duration);
			cleanup();
			reject(new Error(`Flashing timed out after 60 seconds for port ${portPath}`));
		}, 60000); // 60 second timeout

		// Monitor port status during flashing (it's expected to disappear)
		portCheckInterval = setInterval(async () => {
			try {
				const ports = await getConnectedPorts();
				const portStillExists = ports.find(p => p.path === portPath);
				if (!portStillExists && !portDisappearedDuringFlash.value) {
					log.debug('[FLASH] <port-disconnected-expected>', portPath, flashTimer.duration);
					portDisappearedDuringFlash.value = true;
				}
			} catch (error) {
				// Ignore check errors during flashing
			}
		}, 500);

		try {
			log.debug(`[FLASH] <start>`, flashTimer.duration);

			// Flash the board (port may disappear during this, which is expected)
			await new Flasher(board, portPath).flash(firmataPath);

			log.debug('[FLASH] <done>', flashTimer.duration);

			// After flashing, the board will disconnect and reconnect
			// Wait for the port to reappear (up to 10 seconds)
			if (portDisappearedDuringFlash.value) {
				log.debug('[FLASH] <waiting-for-port>', portPath, flashTimer.duration);
				try {
					await waitForPortToReappear(portPath, 10000, 500);
					log.debug('[FLASH] <port-ready>', portPath, flashTimer.duration);
				} catch (waitError) {
					log.warn('[FLASH] <port-wait-timeout>', portPath, waitError);
					// Don't fail if port doesn't reappear - it might come back later
					// The connection loop will handle it
				}
			}

			// Release lock after all operations complete
			cleanup();
			resolve(null);
		} catch (flashError) {
			log.error('[FLASH] <error>', flashError, flashTimer.duration);

			// Check if the error is port-related
			const isPortRelatedError =
				flashError instanceof PortDisconnectedError ||
				flashError instanceof UnableToOpenSerialConnection ||
				(flashError instanceof Error &&
					(flashError.message.includes('No such file or directory') ||
						flashError.message.includes('cannot open') ||
						flashError.message.includes('disconnected')));

			// If port disappeared during flash (expected behavior), wait for it to reappear
			if (portDisappearedDuringFlash.value) {
				log.debug('[FLASH] <checking-port-reappearance>', portPath, flashTimer.duration);
				try {
					await waitForPortToReappear(portPath, 5000, 200);
					log.debug('[FLASH] <port-reappeared-after-error>', portPath);
					// Port reappeared - if error was port-related, it might have been temporary
					// If it was a real flash error, reject with the original error
					cleanup();
					reject(flashError);
				} catch (waitError) {
					// Port didn't reappear - this could be:
					// 1. A real disconnection (if error was port-related)
					// 2. A flash failure that prevented reconnection (if error was not port-related)
					cleanup();
					if (isPortRelatedError) {
						reject(
							new PortDisconnectedError(
								portPath,
								`Port ${portPath} disconnected during flashing and did not reappear: ${flashError instanceof Error ? flashError.message : String(flashError)}`
							)
						);
					} else {
						// Flash error that prevented reconnection
						reject(flashError);
					}
				}
			} else {
				// Port didn't disappear during flash, so check if it's still there
				try {
					await checkPortError(flashError, portPath, 'flashing');
					// Port still exists but couldn't flash - preserve original error
					cleanup();
					reject(flashError);
				} catch (portError) {
					// Port disconnected or already PortDisconnectedError - reject with port error
					cleanup();
					reject(portError);
				}
			}
		}
	});
}
