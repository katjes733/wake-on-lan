import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  type ButtonProps,
  type DialogProps,
} from "@mui/material";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmColor?: ButtonProps["color"];
  confirmLoading?: boolean;
  maxWidth?: DialogProps["maxWidth"];
  fullWidth?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  confirmColor = "primary",
  confirmLoading = false,
  maxWidth,
  fullWidth,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {typeof description === "string" ? (
          <DialogContentText>{description}</DialogContentText>
        ) : (
          description
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={confirmLoading}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          color={confirmColor}
          variant="contained"
          disabled={confirmLoading}
          startIcon={
            confirmLoading ? <CircularProgress size={16} /> : undefined
          }
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
