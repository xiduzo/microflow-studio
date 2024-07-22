import { Input, Slider } from "@fhb/ui";
import { Position } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { useUpdateNodeData } from "../../../hooks/nodeUpdater";
import { nodeSelector, useNodesEdgesStore } from "../../../store";
import { Handle } from "./Handle";
import { AnimatedNode, NodeContainer, NodeContent, NodeHeader } from "./Node";

export function Map(props: Props) {
  const { node } = useNodesEdgesStore(
    useShallow(nodeSelector<Props["data"]>(props.id)),
  );

  const { updateNodeData } = useUpdateNodeData<MapData>(props.id);

  if (!node) return null;

  const values = [].concat(node.data.from).concat(node.data.to).filter(x => x !== undefined)
  const max = Math.max(...values)
  const min = Math.min(...values)

  return (
    <NodeContainer {...props}>
      <NodeContent>
        <NodeHeader className="text-4xl tabular-nums">
          {node.data.value?.[0] ?? "0"}
        </NodeHeader>
        <section className="flex flex-col space-y-3 w-[180px]">
          <div className="flex space-x-2 justify-between w-xs">
            <Input type="number" value={node.data.from[0]} onChange={change => updateNodeData({
              from: [parseInt(change.target.value), node.data.from[1]]
            })} />
            <Input type="number" value={node.data.from[1]} onChange={change => updateNodeData({
              from: [node.data.from[0], parseInt(change.target.value)]
            })} />
          </div>
          <Slider disabled defaultValue={node.data.from} value={node.data.from} min={min} max={max} />
        </section>
        <section className="flex flex-col space-y-3 pt-3 w-[180px]">
          <Slider disabled defaultValue={node.data.to} value={node.data.to} min={min} max={max} />
          <div className="flex space-x-2 justify-between w-xs">
            <Input type="number" value={node.data.to[0]} onChange={change => updateNodeData({
              to: [parseInt(change.target.value), node.data.to[1]]
            })} />
            <Input type="number" value={node.data.to[1]} onChange={change => updateNodeData({
              to: [node.data.to[0], parseInt(change.target.value)]
            })} />
          </div>
        </section>
        <NodeHeader className="text-4xl tabular-nums">
          {node.data.value?.[1] ?? "0"}
        </NodeHeader>
      </NodeContent>
      <Handle type="target" position={Position.Top} id="from" />
      <Handle type="source" position={Position.Bottom} id="to" />
    </NodeContainer>
  );
}

export type MapData = {
  from: number[]
  to: number[]
};
type Props = AnimatedNode<MapData, number[]>;