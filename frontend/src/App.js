import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import CostumeDetail from "@/pages/CostumeDetail";
import Locations from "@/pages/Locations";
import Settings from "@/pages/Settings";
import Shows from "@/pages/Shows";
import ShowDetail from "@/pages/ShowDetail";
import GroupDetail from "@/pages/GroupDetail";
import Flags from "@/pages/Flags";
import Equipment from "@/pages/Equipment";
import { SettingsProvider } from "@/context/SettingsContext";
import { ConfirmProvider } from "@/components/ConfirmDialog";

function App() {
  return (
    <div className="App">
      <SettingsProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/equipment" element={<Equipment />} />
                <Route path="/costume/:id" element={<CostumeDetail />} />
                <Route path="/locations" element={<Locations />} />
                <Route path="/shows" element={<Shows />} />
                <Route path="/shows/:id" element={<ShowDetail />} />
                <Route path="/group/:id" element={<GroupDetail />} />
                <Route path="/flags" element={<Flags />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" richColors />
        </ConfirmProvider>
      </SettingsProvider>
    </div>
  );
}

export default App;
