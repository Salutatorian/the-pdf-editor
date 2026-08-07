import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type PasswordDialogMode = 'protect' | 'unlock';

export type PasswordDialogProps = {
  open: boolean;
  mode: PasswordDialogMode;
  onClose: () => void;
  onSubmit: (password: string, ownerPassword?: string) => void;
  error?: string | null;
};

export function PasswordDialog({
  open,
  mode,
  onClose,
  onSubmit,
  error = null,
}: PasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  const title = mode === 'protect' ? 'Protect PDF' : 'Remove PDF encryption';
  const description =
    mode === 'protect'
      ? 'Password protection is not available in this build (pdf-lib cannot encrypt). Use an external tool such as qpdf.'
      : 'This strips encryption from a copy you can edit. It cannot verify whether the password is correct — only that the file can be opened.';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pdf-pw">
              {mode === 'protect' ? 'User password' : 'Password'}
            </label>
            <Input
              id="pdf-pw"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password) {
                  onSubmit(
                    password,
                    mode === 'protect' ? ownerPassword || undefined : undefined,
                  );
                }
              }}
            />
          </div>
          {mode === 'protect' ? (
            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="pdf-owner-pw"
              >
                Owner password (optional)
              </label>
              <Input
                id="pdf-owner-pw"
                type="password"
                autoComplete="off"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
              />
            </div>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!password}
            onClick={() =>
              onSubmit(
                password,
                mode === 'protect' ? ownerPassword || undefined : undefined,
              )
            }
          >
            {mode === 'protect' ? 'Protect' : 'Unlock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
