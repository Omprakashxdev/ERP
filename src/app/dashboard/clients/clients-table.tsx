"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { createClient, updateClient } from "@/lib/actions/client";
import { Plus, Pencil, Loader2, X, Trash2 } from "lucide-react";

interface ClientContact {
  id?: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  abbreviation: string | null;
  address: string | null;
  contacts: ClientContact[];
  _count: { projects: number };
}

interface ClientsTableProps {
  clients: ClientRow[];
  canManage: boolean;
}

export function ClientsTable({ clients, canManage }: ClientsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.abbreviation?.toLowerCase() ?? "").includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New client
          </Button>
        )}
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[60vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Client</TableHead>
                <TableHead className="whitespace-nowrap">Abbreviation</TableHead>
                <TableHead className="whitespace-nowrap">Address</TableHead>
                <TableHead className="whitespace-nowrap">Projects</TableHead>
                <TableHead className="whitespace-nowrap">Contacts</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-zinc-400">
                    No clients found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="whitespace-nowrap font-medium">{client.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{client.abbreviation ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{client.address ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{client._count.projects}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {client.contacts.length}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setSelectedClient(client)}
                          title="Edit client"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {createOpen && (
        <ClientFormDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
        />
      )}

      {selectedClient && (
        <ClientFormDialog
          mode="edit"
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
}

function ClientFormDialog({
  mode,
  client,
  onClose,
}: {
  mode: "create" | "edit";
  client?: ClientRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: client?.name ?? "",
    abbreviation: client?.abbreviation ?? "",
    address: client?.address ?? "",
    contacts: client?.contacts?.length ? client.contacts : [{ name: "", email: "", phone: "" }],
  });

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateContact(index: number, patch: Partial<ClientContact>) {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function addContact() {
    setForm((prev) => ({ ...prev, contacts: [...prev.contacts, { name: "", email: "", phone: "" }] }));
  }

  function removeContact(index: number) {
    setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const contacts = form.contacts
      .filter((c) => c.name.trim())
      .map((c) => ({
        ...c,
        email: c.email?.trim() || null,
        phone: c.phone?.trim() || null,
      }));

    const payload = {
      name: form.name.trim(),
      abbreviation: form.abbreviation.trim() || null,
      address: form.address.trim() || null,
      contacts,
    };

    try {
      const res = isEdit
        ? await updateClient({ id: client!.id, ...payload } as never)
        : await createClient(payload as never);

      if (!res.success) {
        setError(res.error ?? "Failed to save client");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      return;
    } finally {
      setSubmitting(false);
    }

    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update client details and contacts." : "Add a new client to the master list."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Client name</Label>
              <Input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Abbreviation</Label>
                <Input
                  value={form.abbreviation}
                  onChange={(e) => updateField("abbreviation", e.target.value)}
                  maxLength={8}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Contacts</Label>
                <Button type="button" size="sm" variant="outline" onClick={addContact}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
              {form.contacts.map((contact, index) => (
                <div key={index} className="grid grid-cols-[1fr,1fr,1fr,auto] gap-2 items-end">
                  <Input
                    placeholder="Name"
                    value={contact.name}
                    onChange={(e) => updateContact(index, { name: e.target.value })}
                  />
                  <Input
                    placeholder="Email"
                    value={contact.email ?? ""}
                    onChange={(e) => updateContact(index, { email: e.target.value })}
                  />
                  <Input
                    placeholder="Phone"
                    value={contact.phone ?? ""}
                    onChange={(e) => updateContact(index, { phone: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeContact(index)}
                    disabled={form.contacts.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save changes" : "Create client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
