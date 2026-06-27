import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import GalleryPage from "./pages/GalleryPage";
import CreatePage from "./pages/CreatePage";
import DetailPage from "./pages/DetailPage";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<GalleryPage />} />
          <Route path="create" element={<CreatePage />} />
          <Route path="work/:id" element={<DetailPage />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
