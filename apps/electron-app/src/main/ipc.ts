import type { Edge, Node } from '@xyflow/react';
import { app, ipcMain, Menu } from 'electron';
import { mainWindowReady } from './window';

import log from 'electron-log/node';
import { exportFlow, selectAudioFiles, readAudioFile } from './file';
import {
	ensureRunnerProcess,
	getRunnerProcess,
	killRunnerProcess,
	sendFlowToRunner,
	getCurrentConnectionState,
} from './board-connection';
import { checkConnectedPort, setupUSBDeviceListeners, stopPortPolling } from './port-manager';
import { Timer } from './utils';

ipcMain.on('ipc-export-flow', async (_event, data: { nodes: Node[]; edges: Edge[] }) => {
	await exportFlow(data.nodes, data.edges);
});

ipcMain.on('ipc-menu', async (_event, data: { action: string; args: any }) => {
	switch (data.action) {
		case 'auto-save':
			const checked = Boolean(data.args);
			const menu = Menu.getApplicationMenu();
			if (!menu) return;

			const menuItem = menu.getMenuItemById('autosave');
			if (!menuItem) return;

			menuItem.checked = checked;
			break;
	}
});

ipcMain.on('ipc-flow', async (event, data: { ip?: string; nodes: Node[]; edges: Edge[] }) => {
	const timer = new Timer();

	log.debug('[FLOW] <request>', timer.duration);

	await ensureRunnerProcess(data.nodes, data.edges, data.ip);

	await sendFlowToRunner(data.nodes, data.edges, timer);
});

ipcMain.on('ipc-external-value', (_event, data: { nodeId: string; value: unknown }) => {
	log.debug('[EXTERNAL] <ipc> send to runner', data);
	const runnerProcess = getRunnerProcess();
	runnerProcess?.send({ type: 'setExternal', nodeId: data.nodeId, value: data.value });
});

ipcMain.handle('ipc-select-audio-files', async () => {
	return await selectAudioFiles();
});

ipcMain.handle('ipc-read-audio-file', async (_event, filePath: string) => {
	const buffer = await readAudioFile(filePath);
	// Convert buffer to base64 for transmission
	return buffer.toString('base64');
});

ipcMain.handle('ipc-get-connection-status', async () => {
	log.debug('[IPC] <get-connection-status>');
	const state = getCurrentConnectionState();
	return state;
});

killRunnerProcess().catch(log.debug);

app.on('before-quit', async event => {
	log.debug('[PROCESS] <before-quit>', event);
	void killRunnerProcess();
	stopPortPolling();
});

function waitForMainWindow() {
	if (mainWindowReady) {
		setupUSBDeviceListeners(killRunnerProcess);
		// Initial check for connected port
		checkConnectedPort();
		return;
	}

	setTimeout(waitForMainWindow, 50);
}

waitForMainWindow();
