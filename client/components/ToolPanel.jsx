import { useEffect, useState } from "react";

function FunctionCallOutput({ functionCallOutput }) {
  const { theme, colors } = JSON.parse(functionCallOutput.arguments);

  const colorBoxes = colors.map((color) => (
    <div
      key={color}
      className="w-full h-16 rounded-xl flex items-center justify-center border border-slate-200 shadow-sm"
      style={{ backgroundColor: color }}
    >
      <p className="text-sm font-semibold text-slate-900 bg-white/85 rounded-full px-3 py-1 border border-white/80 shadow-sm">
        {color}
      </p>
    </div>
  ));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Theme: <span className="font-semibold text-slate-800">{theme}</span>
      </p>
      {colorBoxes}
      <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto border border-slate-800">
        {JSON.stringify(functionCallOutput, null, 2)}
      </pre>
    </div>
  );
}

export default function ToolPanel({
  isSessionActive,
  sendClientEvent,
  events,
}) {
  const [functionCallOutput, setFunctionCallOutput] = useState(null);

  useEffect(() => {
    if (!events || events.length === 0) return;

    const mostRecentEvent = events[0];
    if (
      mostRecentEvent.type === "response.done" &&
      mostRecentEvent.response.output
    ) {
      mostRecentEvent.response.output.forEach((output) => {
        if (
          output.type === "function_call" &&
          output.name === "display_color_palette"
        ) {
          setFunctionCallOutput(output);
          setTimeout(() => {
            sendClientEvent({
              type: "response.create",
              response: {
                instructions: `
                ask for feedback about the color palette - don't repeat 
                the colors, just ask if they like the colors.
              `,
              },
            });
          }, 500);
        }
      });
    }
  }, [events, sendClientEvent]);

  useEffect(() => {
    if (!isSessionActive) {
      setFunctionCallOutput(null);
    }
  }, [isSessionActive]);

  return (
    <section className="h-full w-full flex flex-col gap-4">
      <div className="h-full bg-white/80 rounded-2xl p-4 border border-slate-200 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">
          Color Palette Tool
        </h2>
        {isSessionActive
          ? (
            functionCallOutput
              ? <FunctionCallOutput functionCallOutput={functionCallOutput} />
              : <p className="text-sm text-slate-500">
                Ask for advice on a color palette...
              </p>
          )
          : (
            <p className="text-sm text-slate-500">
              Start the session to use this tool...
            </p>
          )}
      </div>
    </section>
  );
}
