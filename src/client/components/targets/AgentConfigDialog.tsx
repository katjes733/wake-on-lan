import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { isAxiosError } from "axios";
import { AgentConfigSchema } from "~/shared/schemas/agentConfig";
import * as targetsApi from "~/client/api/targetsApi";
import type { ApiTarget, AgentConfig } from "~/client/api/targetsApi";
import { useNotification } from "~/client/components/notification/useNotification";

interface AgentConfigDialogProps {
  open: boolean;
  target: ApiTarget | null;
  onClose: () => void;
}

export default function AgentConfigDialog({
  open,
  target,
  onClose,
}: AgentConfigDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [wolAware, setWolAware] = useState(false);
  const [defaultScript, setDefaultScript] = useState("");
  const [wolScript, setWolScript] = useState("");
  const [manualBootScript, setManualBootScript] = useState("");
  const [shutdownEnabled, setShutdownEnabled] = useState(false);
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    setLoading(true);
    setSubmitError(null);
    targetsApi
      .getAgentConfig(target.id)
      .then((config) => {
        setWolAware(config.wolAware);
        setDefaultScript(config.defaultScript ?? "");
        setWolScript(config.wolScript ?? "");
        setManualBootScript(config.manualBootScript ?? "");
        setShutdownEnabled(config.shutdownEnabled);
        setPollIntervalSeconds(
          config.pollIntervalSeconds != null
            ? String(config.pollIntervalSeconds)
            : "",
        );
      })
      .catch(() => {
        setSubmitError("Failed to load agent config");
      })
      .finally(() => setLoading(false));
  }, [open, target]);

  const handleSubmit = async () => {
    if (!target) return;
    const input = {
      wolAware,
      defaultScript: defaultScript || null,
      wolScript: wolScript || null,
      manualBootScript: manualBootScript || null,
      shutdownEnabled,
      pollIntervalSeconds: pollIntervalSeconds
        ? Number(pollIntervalSeconds)
        : null,
    };
    const result = AgentConfigSchema.safeParse(input);
    if (!result.success) {
      setSubmitError(result.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await targetsApi.saveAgentConfig(target.id, result.data as AgentConfig);
      showNotification("Agent settings saved", "success");
      onClose();
    } catch (err) {
      const message = isAxiosError(err)
        ? (err.response?.data?.error as string | undefined)
        : undefined;
      setSubmitError(message ?? "Failed to save agent settings");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Agent Settings{target ? ` — ${target.name}` : ""}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={shutdownEnabled}
                  onChange={(e) => setShutdownEnabled(e.target.checked)}
                />
              }
              label="Allow remote shutdown"
            />
            <TextField
              label="Poll interval (seconds, optional)"
              placeholder="Leave blank to use the agent's own default"
              value={pollIntervalSeconds}
              onChange={(e) => setPollIntervalSeconds(e.target.value)}
              fullWidth
            />
            <Divider />
            <FormControlLabel
              control={
                <Switch
                  checked={wolAware}
                  onChange={(e) => setWolAware(e.target.checked)}
                />
              }
              label="Detect Wake-on-LAN boots"
            />
            <TextField
              label="Script to run on every boot (optional)"
              placeholder="C:\Scripts\on-boot.ps1"
              value={defaultScript}
              onChange={(e) => setDefaultScript(e.target.value)}
              helperText="Must already exist on this target's own machine — only a reference is stored here, never script content."
              fullWidth
            />
            <TextField
              label="Script to run when a WOL boot is detected (optional)"
              placeholder="C:\Scripts\cec-silent-boot.ps1"
              value={wolScript}
              onChange={(e) => setWolScript(e.target.value)}
              disabled={!wolAware}
              helperText="Only runs when 'Detect Wake-on-LAN boots' is on and this boot was actually triggered by Wake."
              fullWidth
            />
            <TextField
              label="Script to run on a manual (non-WOL) boot (optional)"
              placeholder="C:\Scripts\manual-boot.ps1"
              value={manualBootScript}
              onChange={(e) => setManualBootScript(e.target.value)}
              disabled={!wolAware}
              helperText="Only runs when 'Detect Wake-on-LAN boots' is on and this boot was NOT triggered by Wake — the counterpart to the WOL-boot script above."
              fullWidth
            />
            {submitError && (
              <Typography color="error">{submitError}</Typography>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting || loading}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
