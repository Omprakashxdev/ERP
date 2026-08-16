"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractorFilterInput } from "@/lib/schemas/contractor";
import { ContractorWithComputed } from "@/types/contractor";
import { ContractorForm } from "./contractor-form";
import { ContractorProjectsDialog } from "./contractor-projects-dialog";
import type { MasterData } from "@/lib/master-data";
import { BillCertificationDialog } from "./bill-certification-dialog";
import { withBasePath } from "@/lib/base-path";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
  HardHat,
  FileCheck,
  FolderOpen,
  Eye,
  Download,
  FileText,
  Wrench,
  Phone,
  Receipt,
  FileX,
  Building,
  Calendar,
  DollarSign,
  Layers,
  MapPin,
  Mail,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

interface ContractorsTableProps {
  rows: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: ContractorFilterInput;
  masters?: MasterData;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? Number(value) : Number(value);
  if (isNaN(num)) return "—";
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value.toLowerCase().replace(/_/g, " ");
}

/* ─────────────────────────────────────────────────────────────
   Contractor View Dossier Dialog
───────────────────────────────────────────────────────────── */
interface ContractorViewDialogProps {
  contractor: any;
  onClose: () => void;
  onEdit: () => void;
}

function DocumentCard({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path?: string | null;
}) {
  const isUploaded = Boolean(path);

  return (
    <div
      className={`flex flex-col justify-between rounded-lg border p-3.5 transition-all ${
        isUploaded
          ? "border-emerald-200 bg-emerald-50/40 hover:border-emerald-300"
          : "border-zinc-200 bg-zinc-50/60 opacity-80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
              isUploaded
                ? "bg-emerald-600 text-white"
                : "bg-zinc-200 text-zinc-400"
            }`}
          >
            {isUploaded ? (
              <FileCheck className="h-4 w-4" />
            ) : (
              <FileX className="h-4 w-4" />
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-900">{title}</h4>
            <p className="text-[11px] text-zinc-500 line-clamp-1">{description}</p>
          </div>
        </div>
        <Badge
          variant={isUploaded ? "default" : "secondary"}
          className={`shrink-0 text-[10px] font-medium ${
            isUploaded
              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-100"
          }`}
        >
          {isUploaded ? "Uploaded" : "Missing"}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-zinc-200/60 pt-2.5">
        <span className="text-[11px] text-zinc-400 truncate max-w-[140px]">
          {isUploaded ? path?.split("/").pop() || "Attached" : "No file attached"}
        </span>
        <div className="flex items-center gap-1.5">
          {isUploaded ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] font-medium gap-1 text-zinc-700 bg-white hover:bg-zinc-50"
                onClick={() => window.open(withBasePath(path!), "_blank")}
                title="View document"
              >
                <Eye className="h-3 w-3" />
                View
              </Button>
              <a
                href={withBasePath(path!)}
                download
                target="_blank"
                rel="noreferrer"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px] font-medium gap-1 text-zinc-700 bg-white hover:bg-zinc-50"
                  title="Download document"
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>
              </a>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-zinc-400"
              disabled
            >
              Not uploaded
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractorViewDialog({
  contractor,
  onClose,
  onEdit,
}: ContractorViewDialogProps) {
  const [activeTab, setActiveTab] = useState("contract");

  const documents = [
    {
      title: "Work Order Copy",
      desc: "Official signed work order from client authority",
      path: contractor.workOrderCopyPath,
      tab: "contract",
    },
    {
      title: "Tender Copy / Notice",
      desc: "Tender advertisement or approval document",
      path: contractor.tenderCopyPath,
      tab: "contract",
    },
    {
      title: "DPR Document",
      desc: "Detailed Project Report sanctioned copy",
      path: contractor.dprDocumentPath,
      tab: "technical",
    },
    {
      title: "TS/AA Sanction Approval",
      desc: "Technical Sanction & Admin Approval order",
      path: contractor.tsAaDocumentPath,
      tab: "technical",
    },
    {
      title: "Engineering & Site Drawings",
      desc: "Approved architectural & blueprint plans (.pdf/.dwg)",
      path: contractor.drawingsPath,
      tab: "technical",
    },
    {
      title: "Contact & Address Proof",
      desc: "Visiting card, letterhead or GST certificate",
      path: contractor.contactProofPath,
      tab: "contact",
    },
    {
      title: "Schedule B Document",
      desc: "Approved Schedule B bill of quantities and rates",
      path: contractor.scheduleBPath,
      tab: "billing",
    },
    {
      title: "RA Bills & Test Certificates",
      desc: "Running Account bills, measurement sheets & lab test copies",
      path: contractor.raBillsPath,
      tab: "billing",
    },
    {
      title: "Final Progress Format",
      desc: "Final work completion and project expense summary",
      path: contractor.finalProgressPath,
      tab: "billing",
    },
    {
      title: "Completion Certificate",
      desc: "Annexure 3 A Work Completion Certificate",
      path: contractor.completionCertificatePath,
      tab: "billing",
    },
  ];

  const totalDocs = documents.length;
  const uploadedCount = documents.filter((d) => Boolean(d.path)).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] sm:max-w-4xl overflow-hidden flex flex-col p-6">
        <DialogHeader className="border-b pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900">
                  {contractor.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                  {contractor.contactPerson ? `Representative: ${contractor.contactPerson} • ` : ""}
                  {contractor.phone || "No phone"} • {contractor.email || "No email"}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-zinc-50 text-xs px-2.5 py-1 font-semibold border-zinc-200"
              >
                {uploadedCount}/{totalDocs} Documents
              </Badge>
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit Profile
              </Button>
            </div>
          </div>

          {/* Quick Info Bar */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg bg-zinc-50 p-3 border border-zinc-200/80 text-xs">
            <div>
              <span className="text-zinc-400 block text-[10px] uppercase tracking-wider font-semibold">
                Contract Amount
              </span>
              <span className="font-bold text-zinc-900 text-sm">
                {formatMoney(contractor.contractAmount)}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[10px] uppercase tracking-wider font-semibold">
                Client Authority
              </span>
              <span className="font-medium text-zinc-800 truncate block">
                {contractor.detailedOrder || "—"}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[10px] uppercase tracking-wider font-semibold">
                Tender ID
              </span>
              <span className="font-medium text-zinc-800 truncate block">
                {contractor.tenderId || "—"}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[10px] uppercase tracking-wider font-semibold">
                Work Type / Service
              </span>
              <span className="font-medium text-zinc-800 truncate block">
                {contractor.workType ? formatEnum(contractor.workType) : "—"}
                {contractor.serviceType ? ` (${formatEnum(contractor.serviceType)})` : ""}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Tabbed Content */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v ?? "contract")}
          className="flex-1 flex flex-col overflow-hidden pt-3"
        >
          <TabsList className="grid w-full grid-cols-4 mb-3">
            <TabsTrigger value="contract" className="flex items-center gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Contract & Orders
            </TabsTrigger>
            <TabsTrigger value="technical" className="flex items-center gap-1.5 text-xs">
              <Wrench className="h-3.5 w-3.5" />
              Technical & Sanctions
            </TabsTrigger>
            <TabsTrigger value="contact" className="flex items-center gap-1.5 text-xs">
              <Phone className="h-3.5 w-3.5" />
              Contact & Address
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-1.5 text-xs">
              <Receipt className="h-3.5 w-3.5" />
              Billing & Documents (A/c.)
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pr-1">
            {/* TAB 1: Contract & Orders */}
            <TabsContent value="contract" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border p-3 space-y-2 bg-white">
                  <h4 className="font-semibold text-zinc-800 border-b pb-1">Contract Particulars</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Detailed Order</span>
                      <span className="font-medium text-zinc-900">{contractor.detailedOrder || "—"}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Work Name</span>
                      <span className="font-medium text-zinc-900">{contractor.workName || "—"}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Work Type</span>
                      <span className="font-medium text-zinc-900">{formatEnum(contractor.workType)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Service Type</span>
                      <span className="font-medium text-zinc-900">{formatEnum(contractor.serviceType)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-2 bg-white">
                  <h4 className="font-semibold text-zinc-800 border-b pb-1">Tender & Agreement</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Tender ID</span>
                      <span className="font-medium text-zinc-900">{contractor.tenderId || "—"}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Approved Amount</span>
                      <span className="font-medium text-zinc-900">{formatMoney(contractor.contractAmount)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Agreement Date</span>
                      <span className="font-medium text-zinc-900">{formatDate(contractor.agreementDate)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Work Order Date</span>
                      <span className="font-medium text-zinc-900">{formatDate(contractor.workOrderDate)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-700">Contract & Order Documents</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DocumentCard
                    title="Work Order Copy"
                    description="Official signed work order from client authority"
                    path={contractor.workOrderCopyPath}
                  />
                  <DocumentCard
                    title="Tender Copy / Advertisement"
                    description="Approved tender notice / copy"
                    path={contractor.tenderCopyPath}
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: Technical & Sanctions */}
            <TabsContent value="technical" className="space-y-4 mt-0">
              <div className="rounded-lg border p-3 space-y-2 bg-white text-xs">
                <h4 className="font-semibold text-zinc-800 border-b pb-1">Technical Sanction References</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-400 block text-[11px]">DPR Reference Number</span>
                    <span className="font-medium text-zinc-900 text-sm">{contractor.dprReference || "—"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">TS / AA Reference Number</span>
                    <span className="font-medium text-zinc-900 text-sm">{contractor.tsAaReference || "—"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-700">Technical & Engineering Files</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <DocumentCard
                    title="DPR Document"
                    description="Detailed Project Report"
                    path={contractor.dprDocumentPath}
                  />
                  <DocumentCard
                    title="TS/AA Approval Sanction"
                    description="Technical & Admin Sanction Order"
                    path={contractor.tsAaDocumentPath}
                  />
                  <DocumentCard
                    title="Engineering Drawings"
                    description="Approved Site Drawings (.pdf/.dwg)"
                    path={contractor.drawingsPath}
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: Contact & Address */}
            <TabsContent value="contact" className="space-y-4 mt-0">
              <div className="rounded-lg border p-3.5 space-y-3 bg-white text-xs">
                <h4 className="font-semibold text-zinc-800 border-b pb-1">Communication Directory</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <Building className="h-4 w-4 text-zinc-400 mt-0.5" />
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Contractor Firm Name</span>
                      <span className="font-semibold text-zinc-900">{contractor.name}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <HardHat className="h-4 w-4 text-zinc-400 mt-0.5" />
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Contact Person / Representative</span>
                      <span className="font-semibold text-zinc-900">{contractor.contactPerson || "—"}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 text-zinc-400 mt-0.5" />
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Phone / Mobile</span>
                      <span className="font-semibold text-zinc-900">{contractor.phone || "—"}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 text-zinc-400 mt-0.5" />
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Email Address</span>
                      <span className="font-semibold text-zinc-900">{contractor.email || "—"}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Registered Office Address</span>
                      <span className="font-normal text-zinc-800">{contractor.address || "—"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-700">Official Contact Verification</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DocumentCard
                    title="Contact / ID / GST Proof"
                    description="Letterhead, visiting card, or GST certificate"
                    path={contractor.contactProofPath}
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: Billing & Documents (A/c.) */}
            <TabsContent value="billing" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg border p-3 bg-white space-y-1">
                  <span className="text-zinc-400 block text-[11px]">Schedule B Amount (₹)</span>
                  <span className="font-bold text-zinc-900 text-sm">{formatMoney(contractor.scheduleBAmount)}</span>
                </div>
                <div className="rounded-lg border p-3 bg-white space-y-1">
                  <span className="text-zinc-400 block text-[11px]">Final Progress Amount (₹)</span>
                  <span className="font-bold text-zinc-900 text-sm">{formatMoney(contractor.finalProgressAmount)}</span>
                </div>
                <div className="rounded-lg border p-3 bg-white space-y-1">
                  <span className="text-zinc-400 block text-[11px]">Project Expense (₹)</span>
                  <span className="font-bold text-zinc-900 text-sm">{formatMoney(contractor.finalProgressProjectExpense)}</span>
                </div>
              </div>

              {contractor.raBillDetails && (
                <div className="rounded-lg border p-3 bg-white text-xs space-y-1">
                  <span className="text-zinc-400 block text-[11px] font-semibold uppercase">RA Bill Details / Notes (A/c.)</span>
                  <p className="text-zinc-700 whitespace-pre-wrap">{contractor.raBillDetails}</p>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-700">Billing & Certification Documents (A/c.)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DocumentCard
                    title="Schedule B Document"
                    description="Schedule B format & rate sheet"
                    path={contractor.scheduleBPath}
                  />
                  <DocumentCard
                    title="RA Bills & Quality Test Copies"
                    description="Running Account bills, measurement sheets & lab test reports"
                    path={contractor.raBillsPath}
                  />
                  <DocumentCard
                    title="Final Progress Format"
                    description="Final project progress and expense summary"
                    path={contractor.finalProgressPath}
                  />
                  <DocumentCard
                    title="Completion Certificate (Annexure 3 A)"
                    description="Official work completion certificate"
                    path={contractor.completionCertificatePath}
                  />
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Contractors Table Component
───────────────────────────────────────────────────────────── */
export function ContractorsTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  filter,
  masters,
}: ContractorsTableProps) {
  const router = useRouter();
  const [selectedContractor, setSelectedContractor] =
    useState<ContractorWithComputed | null>(null);
  const [viewContractor, setViewContractor] =
    useState<ContractorWithComputed | null>(null);
  const [certContractor, setCertContractor] =
    useState<ContractorWithComputed | null>(null);
  const [projectsContractor, setProjectsContractor] =
    useState<ContractorWithComputed | null>(null);
  const [createContractorOpen, setCreateContractorOpen] = useState(false);

  if (rows.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileSpreadsheet className="h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No contractor records</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            Add a contractor to start tracking work orders, drawings, and billing.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => setCreateContractorOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New contractor
          </Button>
        </CardContent>
      </Card>
    );
  }

  const typedRows = rows as ContractorWithComputed[];

  function buildQueryString(newPage: number): string {
    const params = new URLSearchParams();
    if (filter.search) params.set("search", filter.search);
    if (newPage > 1) params.set("page", String(newPage));
    return params.toString() ? `?${params.toString()}` : "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-600">Contractor records ({total})</h2>
        <Button size="sm" onClick={() => setCreateContractorOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New contractor
        </Button>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">Name</TableHead>
                <TableHead className="whitespace-nowrap">Contact Person</TableHead>
                <TableHead className="whitespace-nowrap">Phone</TableHead>
                <TableHead className="whitespace-nowrap">Email</TableHead>
                <TableHead className="whitespace-nowrap">Tender ID</TableHead>
                <TableHead className="whitespace-nowrap">Work Name</TableHead>
                <TableHead className="whitespace-nowrap">Type</TableHead>
                <TableHead className="whitespace-nowrap">Service</TableHead>
                <TableHead className="whitespace-nowrap text-right">Contract Amount</TableHead>
                <TableHead className="whitespace-nowrap">Agreement</TableHead>
                <TableHead className="whitespace-nowrap">Work Order</TableHead>
                <TableHead className="whitespace-nowrap text-right">Projects</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRows.map((row) => (
                <TableRow key={row.id} className="hover:bg-zinc-50/70 transition-colors">
                  <TableCell className="whitespace-nowrap font-medium">
                    <button
                      onClick={() => setViewContractor(row)}
                      className="text-left font-semibold text-zinc-900 hover:text-blue-600 hover:underline transition-colors"
                      title="Click to view dossier"
                    >
                      {row.name}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.contactPerson ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.phone ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.tenderId ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {row.workName ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatEnum(row.workType)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatEnum(row.serviceType)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono font-medium">
                    {formatMoney(row.contractAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.agreementDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.workOrderDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <HardHat className="h-3.5 w-3.5 text-zinc-400" />
                      {row.projectCount ?? row._count.projects}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex gap-1 justify-end">
                      {/* View Dossier Eye Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-zinc-600 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => setViewContractor(row)}
                        title="View contractor dossier & documents"
                      >
                        <Eye className="h-3.5 w-3.5 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setSelectedContractor(row)}
                        title="Edit contractor"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setCertContractor(row)}
                        title="Bill certification"
                      >
                        <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setProjectsContractor(row)}
                        title="Manage projects"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-purple-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Page {page} of {totalPages} ({total} records)
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => router.push(buildQueryString(page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => router.push(buildQueryString(page + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* View Dossier Dialog */}
      {viewContractor && (
        <ContractorViewDialog
          contractor={viewContractor}
          onClose={() => setViewContractor(null)}
          onEdit={() => {
            setSelectedContractor(viewContractor);
            setViewContractor(null);
          }}
        />
      )}

      {/* Edit Dialog */}
      {selectedContractor && (
        <ContractorForm
          contractor={selectedContractor}
          mode="edit"
          masters={masters}
          onClose={() => setSelectedContractor(null)}
        />
      )}

      {/* Create Dialog */}
      {createContractorOpen && (
        <ContractorForm
          mode="create"
          masters={masters}
          onClose={() => setCreateContractorOpen(false)}
        />
      )}

      {/* Bill Certification Dialog */}
      {certContractor && (
        <BillCertificationDialog
          contractor={certContractor}
          onClose={() => setCertContractor(null)}
        />
      )}

      {/* Contractor Projects Dialog */}
      {projectsContractor && (
        <ContractorProjectsDialog
          contractorId={projectsContractor.id}
          contractorName={projectsContractor.name}
          onClose={() => setProjectsContractor(null)}
        />
      )}
    </div>
  );
}
