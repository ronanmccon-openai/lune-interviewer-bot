import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import Root from "./components/Root";

export function render(url = "/") {
  const html = renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <Root />
      </StaticRouter>
    </StrictMode>,
  );
  return { html };
}
