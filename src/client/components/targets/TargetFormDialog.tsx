import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { isAxiosError } from "axios";
import { TargetCreateSchema } from "~/shared/schemas/target";
import type { ApiTarget, TargetInput } from "~/client/api/targetsApi";

interface TargetFormDialogProps {
  open: boolean;
  target: ApiTarget | null;
  onClose: () => void;
  onSubmit: (input: TargetInput) => Promise<void>;
}

type FieldName =
  "name" | "macAddress" | "broadcastAddress" | "staticIp" | "notes";
type FieldErrors = Partial<Record<FieldName, string>>;

export default function TargetFormDialog({
  open,
  target,
  onClose,
  onSubmit,
}: TargetFormDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [name, setName] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [broadcastAddress, setBroadcastAddress] = useState("");
  const [staticIp, setStaticIp] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(target?.name ?? "");
      setMacAddress(target?.macAddress ?? "");
      setBroadcastAddress(target?.broadcastAddress ?? "");
      setStaticIp(target?.staticIp ?? "");
      setNotes(target?.notes ?? "");
      setErrors({});
      setSubmitError(null);
    }
  }, [open, target]);

  const handleSubmit = async () => {
    const input: TargetInput = {
      name,
      macAddress,
      broadcastAddress: broadcastAddress || null,
      staticIp: staticIp || null,
      notes: notes || null,
    };
    const result = TargetCreateSchema.safeParse(input);
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as FieldName | undefined;
        if (key) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(input);
      onClose();
    } catch (err) {
      const message = isAxiosError(err)
        ? (err.response?.data?.error as string | undefined)
        : undefined;
      setSubmitError(message ?? "Failed to save target");
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
      <DialogTitle>{target ? "Edit Target" : "Add Target"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(errors.name)}
            helperText={errors.name}
            fullWidth
            autoFocus
          />
          <TextField
            label="MAC Address"
            placeholder="AA:BB:CC:DD:EE:FF"
            value={macAddress}
            onChange={(e) => setMacAddress(e.target.value)}
            error={Boolean(errors.macAddress)}
            helperText={errors.macAddress}
            fullWidth
          />
          <TextField
            label="Broadcast Address (optional)"
            placeholder="192.168.1.255"
            value={broadcastAddress}
            onChange={(e) => setBroadcastAddress(e.target.value)}
            error={Boolean(errors.broadcastAddress)}
            helperText={errors.broadcastAddress}
            fullWidth
          />
          <TextField
            label="Static IP (optional)"
            placeholder="192.168.1.50"
            value={staticIp}
            onChange={(e) => setStaticIp(e.target.value)}
            error={Boolean(errors.staticIp)}
            helperText={errors.staticIp}
            fullWidth
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={Boolean(errors.notes)}
            helperText={errors.notes}
            fullWidth
            multiline
            minRows={2}
          />
          {submitError && <Typography color="error">{submitError}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
        >
          {target ? "Save" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
