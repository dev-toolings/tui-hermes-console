import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { installApiOrigin } from "./lib/api-origin";
import { router } from "./route-tree";
import "./globals.css";

// Avant le premier rendu : les `loader` des routes partent dès que le routeur
// se monte, et doivent déjà viser la bonne origine.
installApiOrigin();

const container = document.getElementById("root");
if (!container) throw new Error("#root introuvable");

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
