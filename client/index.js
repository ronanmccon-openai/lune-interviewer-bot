// SSR entry point for Vite server build; reuse the render function from our server entry.
import { render } from "./entry-server.jsx";

export { render };
export default { render };
