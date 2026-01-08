import { FigmaVariable, useFigmaStore, useMqttStore } from '@microflow/mqtt-provider/client';
import { Toaster, TooltipProvider } from '@microflow/ui';
import { ReactFlowProvider } from '@xyflow/react';
import { createRoot } from 'react-dom/client';
import { IpcDeepLinkListener } from './render/components/IpcDeepLinkListener';
import { IpcMenuListeners } from './render/components/IpcMenuListener';
import { ReactFlowCanvas } from './render/components/react-flow/ReactFlowCanvas';
import { useSignalNodesAndEdges } from './render/hooks/useSignalNodesAndEdges';
import { useCelebrateFirstUpload, useFlowSync } from './render/hooks/useFlowSync';
import { CelebrationParticles } from './render/components/CelebrationParticles';
import { NewNodeCommandDialog } from './render/providers/NewNodeProvider';
import { StrictMode, useEffect, useMemo } from 'react';
import { useAppStore } from './render/stores/app';
import { Settings } from './render/components/Settings';
import logger from 'electron-log/renderer';
import { useDarkMode } from 'usehooks-ts';

export function App() {
	return (
		<TooltipProvider>
			<section className='h-screen w-screen'>
				<DarkMode />
				<MQTT />
				<FigmaSync />
				<Settings />
				<Toaster position='top-left' className='z-20' duration={5000} />
				<CelebrationParticles />
				<ReactFlowProvider>
					<IpcDeepLinkListener />
					<NewNodeCommandDialog />
					<ReactFlowCanvas />
					<IpcMenuListeners />
					<BoardHooks />
				</ReactFlowProvider>
			</section>
		</TooltipProvider>
	);
}

const root = createRoot(document.body.querySelector('main')!);
root.render(
	<StrictMode>
		<App />
	</StrictMode>
);

function BoardHooks() {
	useSignalNodesAndEdges();
	useCelebrateFirstUpload();
	useFlowSync();

	return null;
}

function MQTT() {
	const { connect } = useMqttStore();
	const { user, mqttConfig } = useAppStore();
	const uniqueId = useMemo(() => user?.name, [user?.name]);

	useEffect(() => {
		if (!uniqueId) return;
		if (!mqttConfig) return;

		connect({ ...mqttConfig, uniqueId }, 'app');
	}, [connect, mqttConfig, uniqueId]);

	return null;
}

function FigmaSync() {
	const { publish, subscribe, status, uniqueId, appName, connectedClients } = useMqttStore();
	const { updateVariableTypes, updateVariableValue } = useFigmaStore();

	const pluginConnected = useMemo(
		() => connectedClients.find(({ appName }) => appName === 'plugin')?.status === 'connected',
		[connectedClients]
	);

	useEffect(() => {
		if (!uniqueId) return;
		return subscribe(`microflow/v1/${uniqueId}/plugin/variables`, (topic, message) => {
			logger.log('[Figma] <<<< variables', topic, message.toString());
			updateVariableTypes(JSON.parse(message.toString()) as Record<string, FigmaVariable>);
		});
	}, [subscribe, uniqueId, updateVariableTypes]);

	useEffect(() => {
		if (!uniqueId) return;
		return subscribe(`microflow/v1/${uniqueId}/plugin/variable/+`, (topic, message) => {
			logger.log('[Figma] <<<< variable', topic, message.toString(), topic.split('/')[5]);
			updateVariableValue(topic.split('/')[5], JSON.parse(message.toString()));
		});
	}, [subscribe, uniqueId, updateVariableValue]);

	useEffect(() => {
		if (!uniqueId) return;
		return subscribe(`microflow/v1/${uniqueId}/${appName}/variables/response`, (topic, message) => {
			logger.log('[Figma] <<<< variables/response', topic, message.toString());
			updateVariableTypes(JSON.parse(message.toString()) as Record<string, FigmaVariable>);
		});
	}, [subscribe, uniqueId, appName, updateVariableTypes]);

	useEffect(() => {
		if (status !== 'connected') return;
		if (!pluginConnected) return;
		if (!uniqueId) return;
		publish(`microflow/v1/${uniqueId}/${appName}/variables/request`, '');
	}, [status, publish, pluginConnected, uniqueId, appName]);

	return null;
}

function DarkMode() {
	const { isDarkMode } = useDarkMode();
	useEffect(() => {
		if (isDarkMode) {
			document.body.classList.add('dark');
		} else {
			document.body.classList.remove('dark');
		}
	}, [isDarkMode]);

	return null;
}
