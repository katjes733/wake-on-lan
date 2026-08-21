import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import { useState } from "react";
import { useTargets } from "~/client/components/targets/useTargets";
import ConfirmDialog from "~/client/components/shared/ConfirmDialog";
import type { ApiTarget } from "~/client/api/targetsApi";

export default function TargetCard({ target }: { target: ApiTarget }) {
  const { wake, shutdown } = useTargets();
  const [waking, setWaking] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleWake = async () => {
    setWaking(true);
    try {
      await wake(target.id);
    } catch {
      // wake() already showed an error toast — nothing more to do here.
    } finally {
      setWaking(false);
    }
  };

  const handleShutdownConfirm = async () => {
    setShuttingDown(true);
    try {
      await shutdown(target.id);
      setConfirmOpen(false);
    } catch {
      // shutdown() already showed an error toast — leave the dialog open
      // so the user can retry without re-opening it.
    } finally {
      setShuttingDown(false);
    }
  };

  const shutdownDisabledReason = !target.agentConfig.shutdownEnabled
    ? "Shutdown is not enabled for this target — turn it on in Config"
    : !target.online
      ? "Target appears offline"
      : null;

  return (
    <Card
      elevation={3}
      sx={{
        minWidth: { xs: "100%", sm: 280 },
        maxWidth: 400,
        flex: 1,
        borderRadius: 2,
      }}
    >
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" fontWeight={600} noWrap sx={{ flex: 1 }}>
            {target.name}
          </Typography>
          <Chip
            label={target.online ? "Online" : "Offline"}
            color={target.online ? "success" : "default"}
            size="small"
          />
        </Box>
        {target.staticIp && (
          <Typography variant="body2" color="text.secondary">
            {target.staticIp}
          </Typography>
        )}
        {target.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {target.notes}
          </Typography>
        )}
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, flexWrap: "wrap", gap: 1 }}>
        <Button
          variant="contained"
          startIcon={
            waking ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <PowerSettingsNewIcon />
            )
          }
          onClick={handleWake}
          disabled={waking}
          fullWidth
        >
          Wake
        </Button>
        <Tooltip
          title={shutdownDisabledReason ?? ""}
          disableHoverListener={!shutdownDisabledReason}
        >
          <span style={{ width: "100%" }}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopCircleIcon />}
              onClick={() => setConfirmOpen(true)}
              disabled={Boolean(shutdownDisabledReason)}
              fullWidth
            >
              Shutdown
            </Button>
          </span>
        </Tooltip>
      </CardActions>
      <ConfirmDialog
        open={confirmOpen}
        title="Shut down this device?"
        description={`This will remotely shut down "${target.name}". Any unsaved work on that machine will be lost.`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleShutdownConfirm}
        confirmLabel="Shut Down"
        confirmColor="error"
        confirmLoading={shuttingDown}
      />
    </Card>
  );
}
