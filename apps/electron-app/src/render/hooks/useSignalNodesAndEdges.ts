import { Edge, useReactFlow } from '@xyflow/react';
import { useEffect, useMemo, useRef } from 'react';
import { UploadedCodeMessage } from '../../common/types';
import { useNodeDataStore } from '../stores/node-data';
import { SIGNAL_DURATION, useSignalActions } from '../stores/signal';
import { useNodeAndEdgeCount } from '../stores/react-flow';

const SPAM_PREVENTION_TIME = SIGNAL_DURATION / 2;

export function useSignalNodesAndEdges() {
	const { getEdges } = useReactFlow();
	const { edgesCount } = useNodeAndEdgeCount();

	const edges = useRef<Edge[]>([]);

	const lastSignals = useRef(new Map<string, number>());

	const { update } = useNodeDataStore();
	const { addSignal } = useSignalActions();

	useEffect(() => {
		edges.current = getEdges();
	}, [getEdges, edgesCount]);

	useEffect(() => {
		return window.electron.ipcRenderer.on<UploadedCodeMessage>('ipc-microcontroller', result => {
			if (!result.success) return;

			// console.debug('[SIGNAL] <ipc-microcontroller>', result);
			update(result.data.source, result.data.value);

			if (!result.data.edgeId) return;
			const lastSignal = lastSignals.current.get(result.data.edgeId);
			const now = Date.now();
			if (lastSignal && now - lastSignal < SPAM_PREVENTION_TIME) return;
			lastSignals.current.set(result.data.edgeId, now);

			const edge = edges.current.find(({ id }) => id === result.data.edgeId);
			if (!edge) return;

			addSignal(edge.id);
		});
	}, [update, addSignal]);

	return null;
}
