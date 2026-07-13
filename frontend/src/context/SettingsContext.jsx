import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";

const SettingsCtx = createContext({
  settings: { org_name: "LUXE", logo_image_id: null, default_view: "grid", show_flag_banner: true, hide_in_use_mode: "full" },
  refreshSettings: async () => {},
  updateSettings: async () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    org_name: "LUXE",
    logo_image_id: null,
    default_view: "grid",
    show_flag_banner: true,
    hide_in_use_mode: "full",
  });

  const refreshSettings = useCallback(async () => {
    try {
      const r = await api.get("/settings");
      setSettings(r.data);
    } catch { /* ignore */ }
  }, []);

  const updateSettings = useCallback(async (patch) => {
    const r = await api.put("/settings", patch);
    setSettings(r.data);
    return r.data;
  }, []);

  useEffect(() => {
    refreshSettings();
    const onFocus = () => refreshSettings();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshSettings]);

  const value = useMemo(() => ({ settings, refreshSettings, updateSettings }), [settings, refreshSettings, updateSettings]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  return useContext(SettingsCtx);
}
