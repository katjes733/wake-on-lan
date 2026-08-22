import { useState } from "react";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import SettingsIcon from "@mui/icons-material/Settings";
import { useTargets } from "~/client/components/targets/useTargets";
import TargetFormDialog from "~/client/components/targets/TargetFormDialog";
import AgentConfigDialog from "~/client/components/targets/AgentConfigDialog";
import ConfirmDialog from "~/client/components/shared/ConfirmDialog";
import { useNotification } from "~/client/components/notification/useNotification";
import type { ApiTarget, TargetInput } from "~/client/api/targetsApi";

export default function ConfigPage() {
  const { targets, create, update, remove } = useTargets();
  const { showNotification } = useNotification();
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<ApiTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [agentConfigTarget, setAgentConfigTarget] = useState<ApiTarget | null>(
    null,
  );

  const openCreate = () => {
    setEditingTarget(null);
    setFormOpen(true);
  };

  const openEdit = (target: ApiTarget) => {
    setEditingTarget(target);
    setFormOpen(true);
  };

  const handleSubmit = async (input: TargetInput) => {
    if (editingTarget) {
      await update(editingTarget.id, input);
      showNotification("Target updated", "success");
    } else {
      await create(input);
      showNotification("Target created", "success");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await remove(deleteTarget.id);
      showNotification("Target deleted", "success");
      setDeleteTarget(null);
    } catch {
      showNotification("Failed to delete target", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box
      sx={{ width: "100%", maxWidth: 700, mx: "auto", px: { xs: 2, sm: 0 } }}
    >
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreate}
        >
          Add Target
        </Button>
      </Box>
      {targets.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: "center", pt: 4 }}>
          No targets configured yet.
        </Typography>
      ) : (
        <List>
          {targets.map((target) => (
            <ListItem
              key={target.id}
              divider
              secondaryAction={
                <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                  <IconButton
                    edge="end"
                    aria-label="agent settings"
                    onClick={() => setAgentConfigTarget(target)}
                  >
                    <SettingsIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="edit"
                    onClick={() => openEdit(target)}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => setDeleteTarget(target)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={target.name}
                secondary={target.macAddress}
              />
            </ListItem>
          ))}
        </List>
      )}
      <TargetFormDialog
        open={formOpen}
        target={editingTarget}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
      <AgentConfigDialog
        open={Boolean(agentConfigTarget)}
        target={agentConfigTarget}
        onClose={() => setAgentConfigTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete target?"
        description={`This will permanently delete "${deleteTarget?.name}".`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        confirmLabel="Delete"
        confirmColor="error"
        confirmLoading={deleting}
      />
    </Box>
  );
}
