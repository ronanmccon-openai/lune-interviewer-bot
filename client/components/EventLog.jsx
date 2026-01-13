import { ArrowUp, ArrowDown } from "react-feather";
import { useState } from "react";

function Event({ event, timestamp }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isClient = event.event_id && !event.event_id.startsWith("event_");

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-800/70 border border-slate-700 text-slate-100 shadow-inner">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isClient ? (
          <ArrowDown className="text-emerald-300" />
        ) : (
          <ArrowUp className="text-sky-300" />
        )}
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-200">
          {isClient ? "client" : "server"}
          <span className="text-slate-400 font-normal normal-case">
            &nbsp;{event.type} | {timestamp}
          </span>
        </div>
      </div>
      <div
        className={`text-slate-100 bg-slate-950/60 p-3 rounded-lg overflow-x-auto border border-slate-700 font-mono text-xs ${
          isExpanded ? "block" : "hidden"
        }`}
      >
        <pre>{JSON.stringify(event, null, 2)}</pre>
      </div>
    </div>
  );
}

export default function EventLog({ events }) {
  const eventsToDisplay = [];
  let deltaEvents = {};

  events.forEach((event) => {
    if (event.type.endsWith("delta")) {
      if (deltaEvents[event.type]) {
        // for now just log a single event per render pass
        return;
      } else {
        deltaEvents[event.type] = event;
      }
    }

    eventsToDisplay.push(
      <Event key={event.event_id} event={event} timestamp={event.timestamp} />,
    );
  });

  return (
    <div className="flex flex-col gap-3 overflow-x-auto text-slate-100">
      {events.length === 0 ? (
        <div className="text-slate-400 text-sm">Awaiting events...</div>
      ) : (
        eventsToDisplay
      )}
    </div>
  );
}
