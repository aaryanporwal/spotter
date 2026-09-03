import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "@/App"
import "@/index.css"

import { ThemeProvider } from "@/components/theme-provider"

const root = document.getElementById("root")
if (!root) {
  throw new Error("Milemark could not find a root element to mount into.")
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="milemark-ui-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
)
