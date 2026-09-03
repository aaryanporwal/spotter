import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "@/App"

describe("App", () => {
  it("renders the trip form and blocks an empty submit", () => {
    render(<App />)

    expect(screen.getByRole("heading", { name: /plan the drive/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /plan my trip/i }))
    expect(screen.getByText(/enter the current location/i)).toBeInTheDocument()
  })
})
