import { useMqtt } from '@fhb/mqtt/client';
import {
	Badge,
	Icons,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '@fhb/ui';
import { Position, useUpdateNodeInternals } from '@xyflow/react';
import { useEffect } from 'react';
import { useUpdateNodeData } from '../../../hooks/nodeUpdater';
import { Handle } from './Handle';
import {
	BaseNode,
	NodeContainer,
	NodeContent,
	NodeHeader,
	NodeSettings,
} from './Node';

export function Mqtt(props: Props) {
	const updateNodeInternals = useUpdateNodeInternals();

	const { updateNodeData } = useUpdateNodeData<MqttData>(props.id);

	const { publish, subscribe, status } = useMqtt();

	useEffect(() => {
		if (props.data.direction !== 'publish') return;
		if (!props.data.topic.length) return;

		publish(props.data.topic, JSON.stringify(props.data.value));
	}, [props.data.value, props.data.topic, props.data.direction, publish]);

	useEffect(() => {
		if (props.data.direction !== 'subscribe') return;
		if (!props.data.topic.length) return;

		const unsubFromTopic = subscribe(props.data.topic, (_topic, message) => {
			let value: unknown;
			try {
				value = JSON.parse(message.toString());
			} catch (error) {
				value = message.toString();

				const parsed = parseFloat(value as string);
				if (!isNaN(parsed)) {
					value = parsed;
				}
			}

			window.electron.ipcRenderer.send(
				'ipc-fhb-value-changed',
				props.type,
				props.id,
				value,
			);
		});

		return () => {
			unsubFromTopic?.then(unsub => unsub?.());
		};
	}, [props.id, props.type, props.data.topic, props.data.direction, subscribe]);

	return (
		<NodeContainer {...props}>
			<NodeContent>
				{status !== 'connected' && (
					<Badge variant="destructive">MQTT not connected</Badge>
				)}
				<NodeHeader className="tabular-nums">
					{props.data.direction === 'publish' ? (
						<Icons.RadioTower className="w-8 h-8" />
					) : (
						<Icons.Antenna className="w-8 h-8" />
					)}
				</NodeHeader>
			</NodeContent>
			<NodeSettings>
				<Select
					value={props.data.direction}
					onValueChange={(value: Direction) => {
						updateNodeData({ direction: value });
						updateNodeInternals(props.id);
					}}
				>
					<SelectTrigger>{props.data.direction ?? 'publish'}</SelectTrigger>
					<SelectContent>
						<SelectItem value="publish">Publish</SelectItem>
						<SelectItem value="subscribe">Subscribe</SelectItem>
					</SelectContent>
				</Select>
				<Label htmlFor={`mqtt-${props.id}`} className="flex justify-between">
					Topic
				</Label>
				<Input
					id={`mqtt-${props.id}`}
					defaultValue={props.data.topic}
					placeholder="your/+/topic/#"
					onChange={event =>
						updateNodeData({
							topic: event.target.value,
						})
					}
				/>
			</NodeSettings>
			{props.data.direction === 'publish' && (
				<Handle type="target" position={Position.Left} id="publish" />
			)}
			{props.data.direction === 'subscribe' && (
				<Handle type="source" position={Position.Right} id="subscribe" />
			)}
			<Handle type="source" position={Position.Bottom} id="change" />
		</NodeContainer>
	);
}
type Direction = 'publish' | 'subscribe';

export type MqttData = { direction: Direction; topic?: string };
type Props = BaseNode<MqttData, unknown>;
