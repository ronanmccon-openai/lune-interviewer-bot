export const metadata = {
  title: "Lune MCP Server",
  description: "MCP server for the Lune ChatGPT app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
