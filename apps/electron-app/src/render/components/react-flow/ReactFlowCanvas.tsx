import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { AppState, useNodesEdgesStore } from "../../store";
import { Button, ButtonData } from "./components/Button";
import { Counter, CounterData } from "./components/Counter";
import { Figma, FigmaData } from "./components/Figma";
import { IfElse, IfElseData } from "./components/IfElse";
import { Interval, IntervalData } from "./components/Interval";
import { Led, LedData } from "./components/Led";
import { Mqtt, MqttData } from "./components/Mqtt";
import { RangeMap, RangeMapData } from "./components/RangeMap";
import { Sensor, SensorData } from "./components/Sensor";
import { ConnectionLine } from "./ConnectionLine";
import { ComponentTabs } from "./panels/ComponentsTabs";
import { SaveButton } from "./panels/SaveButton";
import { SerialConnectionStatus } from "./panels/SerialConnectionStatus";

const nodeTypes = {
  Button: Button,
  Led: Led,
  Counter: Counter,
  Figma: Figma,
  Interval: Interval,
  IfElse: IfElse,
  RangeMap: RangeMap,
  Mqtt: Mqtt,
  Sensor: Sensor
};

export type NodeType = keyof typeof nodeTypes;

const selector = (state: AppState) => ({
  nodes: state.nodes,
  edges: state.edges,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onConnect: state.onConnect,
  addNode: state.addNode,
});

export function ReactFlowComponent() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useNodesEdgesStore(useShallow(selector));
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData(
        "application/reactflow",
      ) as keyof typeof nodeTypes;

      const position = screenToFlowPosition({
        x: event.clientX - 120,
        y: event.clientY - 75,
      });

      let data: Record<string, any> = {};

      switch (type) {
        case "Button":
          data = { pin: 1 } satisfies ButtonData;
          break;
        case "Counter":
          data = {} satisfies CounterData;
          break;
        case "Figma":
          data = {} satisfies FigmaData;
          break;
        case "IfElse":
          data = { validator: 'boolean', subValidator: "", validatorArgs: [] } satisfies IfElseData;
          break;
        case "Interval":
          data = { interval: 500 } satisfies IntervalData;
          break;
        case "Led":
          data = { pin: 13 } satisfies LedData;
          break;
        case "RangeMap":
          data = { from: [0, 1023], to: [0, 1023] } satisfies RangeMapData;
          break;
        case "Mqtt":
          data = { topic: "" } satisfies MqttData;
          break;
        case "Sensor":
          data = { pin: "A0" } satisfies SensorData;
          break;
      }

      const newNode = {
        id: Math.random().toString(36).substring(2, 8),
        type,
        position,
        data,
      };

      addNode(newNode);
    },
    [screenToFlowPosition],
  );

  return (
    <ReactFlow
      // @ts-expect-error
      nodeTypes={nodeTypes}
      colorMode="dark"
      nodes={nodes}
      edges={edges}
      connectionLineComponent={ConnectionLine}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDrop={onDrop}
      onDragOver={onDragOver}
      minZoom={0.2}
      maxZoom={1.25}
    >
      <Controls />
      <MiniMap
        nodeColor={(node) => {
          if (node.selected) return "#3b82f6";
          if (
            node.data.animated !== undefined &&
            node.data.value !== undefined &&
            node.data.value !== null
          )
            return "#f97316";
        }}
        nodeBorderRadius={12}
      />
      <Background gap={32} />

      <Panel position="top-left">
        <ComponentTabs />
      </Panel>

      <Panel position="top-center">
        <SerialConnectionStatus />
      </Panel>

      <Panel position="top-right">
        <SaveButton />
      </Panel>

      <Panel
        position="bottom-center"
        className="text-gray-50/20 bg-neutral-950/5 backdrop-blur-sm rounded-md p-2"
      >
        <a href="https://www.sanderboer.nl" target="_blank" className="py-2 text-center opacity-60 transition-all hover:opacity-100 hover:underline">
          Made with ♥ by Xiduzo
        </a>
      </Panel>
    </ReactFlow>
  );
}
