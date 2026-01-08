import { BOARDS, getConnectedPorts, type BoardName, type PortInfo } from '@microflow/flasher';
import { session } from 'electron';
import log from 'electron-log/node';
import { sendMessageToRenderer } from './window';
import { Board } from '../common/types';

/**
 * Error thrown when a port is no longer available (device disconnected)
 * This allows the board checking loop to continue to the next port/board
 */
export class PortDisconnectedError extends Error {
	constructor(
		public readonly portPath: string,
		message?: string
	) {
		super(message ?? `Port ${portPath} is no longer available`);
		this.name = 'PortDisconnectedError';
	}
}

let connectedPort: PortInfo | undefined;
let portPollingInterval: NodeJS.Timeout | null = null;
let lastKnownPorts: PortInfo[] = [];
const PORT_POLL_INTERVAL_MS = 1000; // Poll every second as fallback

// Lock to prevent port polling during critical operations (flashing, connecting)
let portOperationLock = false;
let lockCount = 0;

/**
 * Gets the currently connected port
 */
export function getConnectedPort(): PortInfo | undefined {
	return connectedPort;
}

/**
 * Sets the currently connected port
 */
export function setConnectedPort(port: PortInfo | undefined): void {
	connectedPort = port;
}

/**
 * Acquires a lock to prevent port polling during critical operations
 * Returns a release function that must be called when the operation completes
 */
export function acquirePortOperationLock(): () => void {
	lockCount++;
	portOperationLock = true;
	log.debug('[PORT-LOCK] <acquired>', lockCount);

	return () => {
		lockCount--;
		if (lockCount <= 0) {
			lockCount = 0;
			portOperationLock = false;
			log.debug('[PORT-LOCK] <released>');
		} else {
			log.debug('[PORT-LOCK] <decremented>', lockCount);
		}
	};
}

/**
 * Checks if a port operation is currently in progress
 */
export function isPortOperationLocked(): boolean {
	return portOperationLock;
}

/**
 * Converts a USB device product ID (number) to a lowercase hex string for matching
 */
function productIdToHex(productId: number): string {
	return productId.toString(16).padStart(4, '0').toLowerCase();
}

/**
 * Checks if a USB device matches any known board by product ID
 */
function isKnownBoard(productId: number): boolean {
	const productIdHex = productIdToHex(productId);
	return BOARDS.some(board => board.productIds.includes(productIdHex as never));
}

/**
 * Checks if the currently connected port still exists
 */
export async function checkConnectedPort(): Promise<void> {
	if (!connectedPort) return;

	const ports = await getConnectedPorts();
	const portStillExists = ports.find(({ path }) => path === connectedPort?.path);

	if (!portStillExists) {
		log.debug('[PORTS] <disconnected>', connectedPort?.path);
		sendMessageToRenderer<Board>('ipc-board', {
			success: true,
			data: {
				type: 'close',
				port: connectedPort?.path,
				message: `${connectedPort?.path} is no longer connected`,
			},
		});
	}
}

/**
 * Gets all known boards with their matching ports
 */
export async function getKnownBoardsWithPorts(): Promise<[BoardName, PortInfo[]][]> {
	try {
		const ports = await getConnectedPorts();

		const boardsWithPorts = BOARDS.reduce(
			(acc, board) => {
				const matchingDevices = ports.filter(port => {
					const productId = port.productId || port.pnpId;
					if (!productId) return false;
					return board.productIds.includes(productId.toLowerCase() as never);
				});

				if (matchingDevices.length) {
					acc.push([board.name, matchingDevices]);
				}

				return acc;
			},
			[] as [BoardName, PortInfo[]][]
		);

		log.debug('[PORTS] <boards>', boardsWithPorts.length);
		boardsWithPorts.forEach(([board, devices]) => {
			log.debug('[PORTS] <board>', board, devices.map(device => device.path).join(', '));
		});

		return boardsWithPorts;
	} catch (error) {
		log.warn('[PORTS] <error>', error);
		return [];
	}
}

/**
 * Starts polling for port changes as a fallback mechanism
 */
export function startPortPolling(onPortDisconnected: () => Promise<void>): void {
	// Initial port list - check for existing boards on startup
	getConnectedPorts().then(async ports => {
		lastKnownPorts = ports;

		// Check if there are any known boards already connected on startup
		const boardsWithPorts = await getKnownBoardsWithPorts();
		if (boardsWithPorts.length > 0 && !connectedPort) {
			log.debug('[PORTS] <startup-boards-found>', boardsWithPorts.length);
			// Send connect message to trigger connection attempt
			sendMessageToRenderer<Board>('ipc-board', {
				success: true,
				data: { type: 'connect', message: 'Board detected' },
			});
		}
	});

	portPollingInterval = setInterval(async () => {
		// Skip polling if a critical operation is in progress
		if (portOperationLock) {
			log.debug('[POLL] <skipped>', 'Port operation in progress');
			return;
		}

		const currentPorts = await getConnectedPorts();

		// Check for disconnected port
		if (connectedPort && !currentPorts.find(p => p.path === connectedPort?.path)) {
			log.debug('[POLL] <disconnected>', connectedPort.path);
			sendMessageToRenderer<Board>('ipc-board', {
				success: true,
				data: {
					type: 'close',
					port: connectedPort.path,
					message: `${connectedPort.path} is no longer connected`,
				},
			});
			await onPortDisconnected();
		}

		// Check for new ports
		if (currentPorts.length > lastKnownPorts.length) {
			const newPorts = currentPorts.filter(p => !lastKnownPorts.find(lp => lp.path === p.path));

			if (newPorts.length > 0) {
				log.debug('[POLL] <new-ports>', newPorts.map(p => p.path).join(', '));
				sendMessageToRenderer<Board>('ipc-board', {
					success: true,
					data: { type: 'connect', message: 'New port connected' },
				});
			}
		}

		lastKnownPorts = currentPorts;
	}, PORT_POLL_INTERVAL_MS);

	log.debug('[POLL] <started>', `Polling every ${PORT_POLL_INTERVAL_MS}ms as fallback`);
}

/**
 * Stops port polling
 */
export function stopPortPolling(): void {
	if (portPollingInterval) {
		clearInterval(portPollingInterval);
		portPollingInterval = null;
		log.debug('[POLL] <stopped>');
	}
}

/**
 * Sets up device event listeners using Electron's native session API
 * Uses serial port events for Arduino devices (which appear as serial ports)
 */
export function setupUSBDeviceListeners(onPortDisconnected: () => Promise<void>): void {
	const defaultSession = session.defaultSession;

	// Set up device permission handler to automatically grant permissions
	defaultSession.setDevicePermissionHandler(details => {
		log.debug('[DEVICE] <permission-request>', {
			deviceType: details.deviceType,
			origin: details.origin,
			device: details.device,
		});

		// Auto-grant permissions for serial ports (Arduino devices)
		if (details.deviceType === 'serial') {
			return true;
		}

		// Auto-grant permissions for USB devices if they match known boards
		if (details.deviceType === 'usb' && details.device) {
			const productId = (details.device as any).productId;
			if (productId && isKnownBoard(productId)) {
				return true;
			}
		}

		return false;
	});

	// Handle select-serial-port event - this enables serial port monitoring
	defaultSession.on('select-serial-port', (event, portList, webContents, callback) => {
		log.debug('[SERIAL] <select-port>', {
			portCount: portList.length,
			ports: portList.map(p => ({
				portId: p.portId,
				portName: p.portName,
				displayName: p.displayName,
			})),
		});

		// Cancel the selection - we handle port selection ourselves
		// Note: serial-port-added/removed events only fire when handling this event
		event.preventDefault();
		// Pass empty string to cancel the selection
		callback('');
	});

	// Handle serial port added (Arduino devices appear as serial ports)
	defaultSession.on('serial-port-added', async (_event, port) => {
		log.debug('[SERIAL] <port-added>', {
			portId: port.portId,
			portName: port.portName,
			displayName: port.displayName,
			vendorId: port.vendorId,
			productId: port.productId,
		});

		// Check if this is a known board
		// port.productId is a number (USB product ID)
		const productId = typeof port.productId === 'number' ? port.productId : undefined;
		if (productId !== undefined && isKnownBoard(productId)) {
			log.debug('[SERIAL] <known-board-added>', productIdToHex(productId), port.portName);

			// Wait a bit for the port to be fully available
			setTimeout(async () => {
				const ports = await getConnectedPorts();
				const matchingPort = ports.find(p => {
					// Try to match by port name/path or product ID
					if (p.path === port.portName) return true;
					const portProductId = p.productId || p.pnpId;
					if (portProductId && productId !== undefined) {
						return productIdToHex(productId) === portProductId.toLowerCase();
					}
					return false;
				});

				if (matchingPort) {
					log.debug('[PORTS] <new>', matchingPort.path);
					sendMessageToRenderer<Board>('ipc-board', {
						success: true,
						data: { type: 'connect', message: 'New port connected' },
					});
				}
			}, 500);
		}
	});

	// Handle serial port removed
	defaultSession.on('serial-port-removed', async (_event, port) => {
		log.debug('[SERIAL] <port-removed>', {
			portId: port.portId,
			portName: port.portName,
			displayName: port.displayName,
		});

		// Check if this was the connected port
		if (
			connectedPort &&
			(connectedPort.path === port.portName || connectedPort.path === port.displayName)
		) {
			log.debug('[PORTS] <disconnected>', connectedPort.path);
			sendMessageToRenderer<Board>('ipc-board', {
				success: true,
				data: {
					type: 'close',
					port: connectedPort.path,
					message: `${connectedPort.path} is no longer connected`,
				},
			});
			await onPortDisconnected();
		}
	});

	// Handle serial port revoked
	defaultSession.on('serial-port-revoked', async (_event, details) => {
		log.debug('[SERIAL] <port-revoked>', details);

		// When a port is revoked, check if our connected port is still accessible
		if (connectedPort) {
			const ports = await getConnectedPorts();
			const portStillExists = ports.find(({ path }) => path === connectedPort?.path);

			if (!portStillExists) {
				log.debug('[SERIAL] <port-revoked>', connectedPort.path);
				sendMessageToRenderer<Board>('ipc-board', {
					success: true,
					data: {
						type: 'close',
						port: connectedPort.path,
						message: `${connectedPort.path} access was revoked`,
					},
				});
				await onPortDisconnected();
			}
		}
	});

	// Also listen to USB device events as a fallback (though they may not fire for serial devices)
	defaultSession.on('usb-device-added', async (_event, device) => {
		log.debug('[USB] <device-added>', {
			vendorId: device.vendorId,
			productId: device.productId,
			serialNumber: device.serialNumber,
		});

		// Check if this is a known board
		if (isKnownBoard(device.productId)) {
			log.debug('[USB] <known-board-added>', productIdToHex(device.productId));

			// Wait a bit for the serial port to be created
			setTimeout(async () => {
				const ports = await getConnectedPorts();
				const newPorts = ports.filter(port => {
					const portProductId = port.productId || port.pnpId;
					if (!portProductId) return false;
					return productIdToHex(device.productId) === portProductId.toLowerCase();
				});

				if (newPorts.length > 0) {
					log.debug('[PORTS] <new>', newPorts.map(p => p.path).join(', '));
					sendMessageToRenderer<Board>('ipc-board', {
						success: true,
						data: { type: 'connect', message: 'New port connected' },
					});
				}
			}, 500);
		}
	});

	defaultSession.on('usb-device-removed', async (_event, device) => {
		log.debug('[USB] <device-removed>', {
			vendorId: device.vendorId,
			productId: device.productId,
			serialNumber: device.serialNumber,
		});

		// Check if this is a known board
		if (isKnownBoard(device.productId)) {
			log.debug('[USB] <known-board-removed>', productIdToHex(device.productId));

			// Check if this was the connected port
			if (connectedPort) {
				const ports = await getConnectedPorts();
				const portStillExists = ports.find(({ path }) => path === connectedPort?.path);

				if (!portStillExists) {
					log.debug('[PORTS] <disconnected>', connectedPort?.path);
					sendMessageToRenderer<Board>('ipc-board', {
						success: true,
						data: {
							type: 'close',
							port: connectedPort?.path,
							message: `${connectedPort?.path} is no longer connected`,
						},
					});
					await onPortDisconnected();
				}
			}
		}
	});

	log.debug('[DEVICE] <listeners-setup>', 'Device event listeners initialized (serial + USB)');

	// Fallback: Lightweight polling since Electron events may not fire automatically
	// These events are tied to Web Serial/USB API usage from renderer
	// We'll poll less frequently as a fallback
	startPortPolling(onPortDisconnected);
}
