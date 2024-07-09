import { Icons, Tabs, TabsContent, TabsList, TabsTrigger } from "@fhb/ui";
import { Draggable } from "./Draggable";

export function ComponentTabs() {
  return (
    <Tabs
      defaultValue="figma"
      className="bg-neutral-950/5 backdrop-blur-md rounded-md p-2 z-50 w-[280px]"
    >
      <TabsList>
        <TabsTrigger value="closed">
          <Icons.Dot />
        </TabsTrigger>
        <TabsTrigger value="figma">Figma</TabsTrigger>
        <TabsTrigger value="hardware">Hardware</TabsTrigger>
        <TabsTrigger value="flow">Flow</TabsTrigger>
      </TabsList>
      <TabsContent value="figma" className="space-y-2">
        <Draggable
          title="Variable"
          type="button"
          description="Interact with figma variables"
          icon={<Icons.Variable />}
          tags={["Input", "Output"]}
        />
      </TabsContent>
      <TabsContent value="hardware" className="space-y-2">
        <Draggable
          title="button"
          type="button"
          description="Buttons are the very basic inputs used everywhere."
          icon={<Icons.SquarePower />}
          tags={["Analog", "Input"]}
        />
        <Draggable
          title="LED"
          type="LED"
          description="LEDs are very tiny light sources"
          icon={<Icons.Lightbulb />}
          tags={["Digital", "Output"]}
        />
      </TabsContent>
      <TabsContent value="flow" className="space-y-2">
        <Draggable
          title="Map"
          type="button"
          description="Map a value from one range to another"
          icon={<Icons.Sigma />}
        />
        <Draggable
          title="If/else"
          type="button"
          description="Control logic"
          icon={<Icons.Split />}
        />
        <Draggable
          title="And"
          type="button"
          description="Control logic"
          icon={<Icons.Merge />}
        />
        <Draggable
          title="Interval"
          type="button"
          description="Do something on a regular interval"
          icon={<Icons.Clock />}
        />
        <Draggable
          title="Counter"
          type="button"
          description="Keep count of things"
          icon={<Icons.Hash />}
        />
      </TabsContent>
    </Tabs>
  );
}
