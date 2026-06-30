import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import CostumeDetail from "@/pages/CostumeDetail";
import Locations from "@/pages/Locations";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/costume/:id" element={<CostumeDetail />} />
            <Route path="/locations" element={<Locations />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
