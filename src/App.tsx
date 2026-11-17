import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Crosshair, MousePointerClick, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WindowControls, dragWindow } from "@/components/WindowControls";
import { splashDone } from "@/lib/splash";
import { checkForUpdate } from "@/lib/updater";
import { cn } from "@/lib/utils";

// Same shape as `Config` in src-tauri/src/clicker.rs
type Config = {
  intervalMs: number;
  button: "left" | "right" | "middle";
  double: boolean;
  repeat: number;
  /** null = wherever the cursor is */
  position: { x: number; y: number } | null;
};

const KEY = "will-autoclick.config";
const DEFAULTS: Config = { intervalMs: 100, button: "left", double: false, repeat: 0, position: null };

function load(): Config {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export default function App() {
  const [config, setConfig] = useState(load);
  const [running, setRunning] = useState(false);
  const set = (patch: Partial<Config>) => setConfig((c) => ({ ...c, ...patch }));
  // Last fixed point, kept while "Cursor" is selected so switching back restores it
  const [point, setPoint] = useState(config.position ?? { x: 0, y: 0 });
  const fixed = config.position !== null;
  const setPointAxis = (axis: "x" | "y", v: string) => {
    const p = { ...point, [axis]: Math.trunc(Number(v) || 0) };
    setPoint(p);
    set({ position: p });
  };

  // Rust keeps a copy so the F6 hotkey works with the window in the background
  useEffect(() => {
    invoke("set_config", { config });
    try {
      localStorage.setItem(KEY, JSON.stringify(config));
    } catch {}
  }, [config]);

  useEffect(() => {
    const offs = [
      listen<boolean>("running", (e) => setRunning(e.payload)),
      // F7 anywhere: the cursor position becomes the fixed point
      listen<{ x: number; y: number }>("picked", (e) => {
        setPoint(e.payload);
        set({ position: e.payload });
      }),
    ];
    splashDone();
    const u = import.meta.env.DEV ? undefined : setTimeout(() => checkForUpdate(true), 5000);
    return () => {
      clearTimeout(u);
      offs.forEach((off) => off.then((f) => f()));
    };
  }, []);

  const cps = config.intervalMs > 0 ? (1000 / config.intervalMs).toFixed(config.intervalMs >= 1000 ? 2 : 1) : "—";

  return (
    <div className="flex h-full flex-col">
      <header onMouseDown={dragWindow} className="flex h-9 shrink-0 items-center gap-2 border-b pl-3">
        <MousePointerClick className="pointer-events-none size-4 text-primary" />
        <span className="pointer-events-none flex-1 font-medium">will-autoclick</span>
        <WindowControls />
      </header>

      <main className="flex flex-1 flex-col gap-5 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Intervalo (ms)" hint={`${cps} cliques/s`}>
            <Input
              type="number"
              min={1}
              value={config.intervalMs}
              disabled={running}
              onChange={(e) => set({ intervalMs: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field label="Repetir" hint={config.repeat === 0 ? "até parar" : `${config.repeat} vezes`}>
            <Input
              type="number"
              min={0}
              value={config.repeat}
              disabled={running}
              onChange={(e) => set({ repeat: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          </Field>
        </div>

        <Field label="Botão">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            className="w-full"
            value={config.button}
            disabled={running}
            onValueChange={(v) => v && set({ button: v as Config["button"] })}
          >
            <ToggleGroupItem value="left" className="flex-1">Esquerdo</ToggleGroupItem>
            <ToggleGroupItem value="middle" className="flex-1">Meio</ToggleGroupItem>
            <ToggleGroupItem value="right" className="flex-1">Direito</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field label="Tipo de clique">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            className="w-full"
            value={config.double ? "double" : "single"}
            disabled={running}
            onValueChange={(v) => v && set({ double: v === "double" })}
          >
            <ToggleGroupItem value="single" className="flex-1">Simples</ToggleGroupItem>
            <ToggleGroupItem value="double" className="flex-1">Duplo</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field
          label="Posição"
          hint={fixed ? "Aperte F7 em qualquer janela para usar a posição do mouse" : "Clica onde o mouse estiver"}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            className="w-full"
            value={fixed ? "fixed" : "cursor"}
            disabled={running}
            onValueChange={(v) => v && set({ position: v === "fixed" ? point : null })}
          >
            <ToggleGroupItem value="cursor" className="flex-1">Cursor</ToggleGroupItem>
            <ToggleGroupItem value="fixed" className="flex-1">
              <Crosshair />
              Fixa
            </ToggleGroupItem>
          </ToggleGroup>
          {fixed && (
            <div className="grid grid-cols-2 gap-3">
              {(["x", "y"] as const).map((axis) => (
                <div key={axis} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground uppercase">{axis}</span>
                  <Input
                    type="number"
                    aria-label={axis.toUpperCase()}
                    value={point[axis]}
                    disabled={running}
                    onChange={(e) => setPointAxis(axis, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </Field>

        <div className="mt-auto flex flex-col gap-2">
          <Button
            size="lg"
            variant={running ? "destructive" : "default"}
            className={cn("h-11 text-base", !running && "shadow-[0_0_24px_var(--glow)]")}
            onClick={() => invoke("toggle")}
          >
            {running ? <Square /> : <Play />}
            {running ? "Parar" : "Iniciar"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Pressione <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">F6</kbd> em qualquer janela para
            iniciar ou parar
          </p>
        </div>
      </main>
      <Toaster position="bottom-center" richColors />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
