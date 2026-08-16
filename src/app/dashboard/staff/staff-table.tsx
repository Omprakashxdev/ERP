"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Staff, Region, EmployeeDetail, Department, Designation, City } from "@prisma/client";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { withBasePath } from "@/lib/base-path";
import { createStaff, updateStaff } from "@/lib/actions/staff";
import {
  Plus,
  Pencil,
  Loader2,
  Search,
  User,
  FileText,
  GraduationCap,
  Users,
  Eye,
  ExternalLink,
  FileCheck,
  FileX,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Building2,
  Briefcase,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, useErrorHandler } from "@/components/error-handling";

type StaffWithDetails = Staff & {
  region?: Region | null;
  reportingManager?: { id: string; name: string; designation: string | null } | null;
  employeeDetail?: EmployeeDetail | null;
};

interface StaffTableProps {
  staff: StaffWithDetails[];
  regions: Region[];
  departments?: Department[];
  designations?: Designation[];
  cities?: City[];
  canManage: boolean;
}

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

export function StaffTable({
  staff,
  regions,
  departments = [],
  designations = [],
  cities = [],
  canManage,
}: StaffTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [viewStaff, setViewStaff] = useState<StaffWithDetails | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffWithDetails | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = staff.filter((s) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term) ||
      s.employeeCode?.toLowerCase().includes(term) ||
      s.designation?.toLowerCase().includes(term) ||
      s.employeeDetail?.department?.toLowerCase().includes(term) ||
      s.phone?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff, code, department…"
            className="pl-8"
          />
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Staff
          </Button>
        )}
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-md border">
        <Table className="text-sm">
          <TableHeader className="sticky top-0 bg-white">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14 text-center">Sr. No</TableHead>
              <TableHead>Emp Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-zinc-400">
                  No staff found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s, index) => (
                <TableRow key={s.id}>
                  <TableCell className="text-center font-mono text-xs text-zinc-500">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold text-zinc-800">
                    {s.employeeCode ?? "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setViewStaff(s)}
                      className="font-medium text-left text-zinc-900 hover:text-teal-700 hover:underline"
                    >
                      {s.name}
                    </button>
                  </TableCell>
                  <TableCell>{s.designation ?? "—"}</TableCell>
                  <TableCell>{s.employeeDetail?.department ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.email ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.region?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={s.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-600 border-zinc-200"}
                    >
                      {s.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-900"
                        onClick={() => setViewStaff(s)}
                        title="View employee profile & documents"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-900"
                          onClick={() => setSelectedStaff(s)}
                          title="Edit staff details"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {viewStaff && (
        <StaffViewDialog
          staff={viewStaff}
          onClose={() => setViewStaff(null)}
          onEdit={() => {
            const current = viewStaff;
            setViewStaff(null);
            setSelectedStaff(current);
          }}
          canManage={canManage}
        />
      )}

      {selectedStaff && (
        <StaffFormDialog
          staff={selectedStaff}
          allStaff={staff}
          regions={regions}
          departments={departments}
          designations={designations}
          cities={cities}
          mode="edit"
          onClose={() => setSelectedStaff(null)}
        />
      )}

      {createOpen && (
        <StaffFormDialog
          allStaff={staff}
          regions={regions}
          departments={departments}
          designations={designations}
          cities={cities}
          mode="create"
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function StaffViewDialog({
  staff,
  onClose,
  onEdit,
  canManage,
}: {
  staff: StaffWithDetails;
  onClose: () => void;
  onEdit: () => void;
  canManage: boolean;
}) {
  const detail = staff.employeeDetail;

  const documentsList = [
    { label: "Interview Form", path: detail?.interviewFormPath },
    { label: "Resume / CV", path: detail?.resumePath },
    { label: "Photo ID Proof (Aadhar / PAN)", path: detail?.photoIdProofPath },
    { label: "Address Proof", path: detail?.addressProofPath },
    { label: "Degree Certificate", path: detail?.degreeCertificatePath },
    { label: "Letter of Guarantee", path: detail?.letterOfGuaranteePath },
    { label: "Office Time Frame (Annexure - A)", path: detail?.officeTimeFramePath },
    { label: "Daily Reporting (Form - 2)", path: detail?.dailyReportingPath },
    { label: "Leave Policy (Form - 3)", path: detail?.leavePolicyPath },
  ];

  const uploadedCount = documentsList.filter((d) => Boolean(d.path)).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold">{staff.name}</DialogTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  {staff.employeeCode || "No Code"}
                </Badge>
                <Badge
                  variant="outline"
                  className={staff.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-600 border-zinc-200"}
                >
                  {staff.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                {staff.designation && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {staff.designation}
                  </span>
                )}
                {detail?.department && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {detail.department}
                  </span>
                )}
                {staff.region?.name && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {staff.region.name}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="employment" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid grid-cols-4 mb-3">
              <TabsTrigger value="employment" className="text-xs flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Employment
              </TabsTrigger>
              <TabsTrigger value="personal" className="text-xs flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Personal & Family
              </TabsTrigger>
              <TabsTrigger value="education" className="text-xs flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" />
                Education
              </TabsTrigger>
              <TabsTrigger value="documents" className="text-xs flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Documents ({uploadedCount}/9)
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto max-h-[55vh] px-1 py-1 space-y-4">
              {/* TAB 1: Employment */}
              <TabsContent value="employment" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4 text-sm bg-zinc-50/70 p-4 rounded-lg border border-zinc-100">
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Full Name</span>
                    <span className="font-medium text-zinc-900">{staff.name}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Employee Code</span>
                    <span className="font-mono text-zinc-900">{staff.employeeCode || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Designation</span>
                    <span className="text-zinc-900">{staff.designation || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Department</span>
                    <span className="text-zinc-900">{detail?.department || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Email ID</span>
                    <span className="text-zinc-900">{staff.email ? <a href={`mailto:${staff.email}`} className="text-teal-600 hover:underline">{staff.email}</a> : "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Primary Phone</span>
                    <span className="text-zinc-900">{staff.phone ? <a href={`tel:${staff.phone}`} className="text-teal-600 hover:underline">{staff.phone}</a> : "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Alternate Phone</span>
                    <span className="text-zinc-900">{detail?.alternatePhone || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Present City of Working</span>
                    <span className="text-zinc-900">{detail?.presentCity || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Region</span>
                    <span className="text-zinc-900">{staff.region?.name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Reporting Manager</span>
                    <span className="text-zinc-900">{staff.reportingManager ? `${staff.reportingManager.name} (${staff.reportingManager.designation || "Manager"})` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Date of Joining</span>
                    <span className="text-zinc-900">{detail?.dateOfJoining ? new Date(detail.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Date of Exit</span>
                    <span className="text-zinc-900">{detail?.dateOfExit ? new Date(detail.dateOfExit).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: Personal & Family */}
              <TabsContent value="personal" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4 text-sm bg-zinc-50/70 p-4 rounded-lg border border-zinc-100">
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Father&apos;s Name</span>
                    <span className="text-zinc-900">{detail?.fatherName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Mother&apos;s Name</span>
                    <span className="text-zinc-900">{detail?.motherName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Date of Birth</span>
                    <span className="text-zinc-900">{detail?.dateOfBirth ? new Date(detail.dateOfBirth).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Nationality</span>
                    <span className="text-zinc-900">{detail?.nationality || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Religion and Caste</span>
                    <span className="text-zinc-900">{detail?.religionCaste || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Marital Status</span>
                    <span className="text-zinc-900">{detail?.maritalStatus || "—"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-zinc-500 font-medium block">Permanent Address</span>
                    <p className="text-zinc-900 whitespace-pre-line mt-0.5">{detail?.permanentAddress || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-zinc-500 font-medium block">Communication Address</span>
                    <p className="text-zinc-900 whitespace-pre-line mt-0.5">{detail?.communicationAddress || "—"}</p>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 3: Education */}
              <TabsContent value="education" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4 text-sm bg-zinc-50/70 p-4 rounded-lg border border-zinc-100">
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Degree Pass out Year</span>
                    <span className="text-zinc-900">{detail?.passOutYear || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 font-medium block">Other Pass out Year</span>
                    <span className="text-zinc-900">{detail?.otherPassOutYear || "—"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-zinc-500 font-medium block">Other Qualifications</span>
                    <span className="text-zinc-900">{detail?.otherQualification || "—"}</span>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 4: Documents (All 9 Files) */}
              <TabsContent value="documents" className="space-y-3 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {documentsList.map((doc, idx) => {
                    const isUploaded = Boolean(doc.path);
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border flex flex-col justify-between gap-2 transition-all ${
                          isUploaded ? "bg-white border-zinc-200 shadow-sm" : "bg-zinc-50/60 border-dashed border-zinc-200 opacity-75"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {isUploaded ? (
                              <FileCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                            ) : (
                              <FileX className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                            )}
                            <div>
                              <span className="text-xs font-semibold text-zinc-800 block">
                                {doc.label}
                              </span>
                              {isUploaded && (
                                <span className="text-[11px] text-zinc-500 block truncate max-w-[200px]" title={doc.path || ""}>
                                  {doc.path?.split("/").pop() || doc.path}
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              isUploaded
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0 px-1.5"
                                : "bg-zinc-100 text-zinc-500 border-zinc-200 text-[10px] py-0 px-1.5"
                            }
                          >
                            {isUploaded ? "Uploaded" : "Missing"}
                          </Badge>
                        </div>

                        {isUploaded && (
                          <div className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
                            <a
                              href={withBasePath(doc.path!)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded transition-colors"
                              title="Open and view document in new tab"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </a>
                            <a
                              href={withBasePath(doc.path!)}
                              download={doc.path?.split("/").pop() || `${staff.name}_${doc.label.replace(/\s+/g, "_")}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded transition-colors"
                              title="Download document to computer"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="flex items-center justify-between pt-3 border-t mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {canManage && (
            <Button size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Edit Profile
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


function StaffFormDialog({
  staff,
  allStaff,
  regions,
  departments = [],
  designations = [],
  cities = [],
  mode,
  onClose,
}: {
  staff?: StaffWithDetails;
  allStaff: StaffWithDetails[];
  regions: Region[];
  departments?: Department[];
  designations?: Designation[];
  cities?: City[];
  mode: "create" | "edit";
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [submitting, setSubmitting] = useState(false);
  const { error, setError, askAi, askingAi, aiResponse } = useErrorHandler();

  const detail = staff?.employeeDetail;

  const [form, setForm] = useState({
    // Tab 1: Employment
    name: staff?.name ?? "",
    email: staff?.email ?? "",
    phone: staff?.phone ?? "",
    employeeCode: staff?.employeeCode ?? "",
    designation: staff?.designation ?? "",
    department: detail?.department ?? "",
    regionId: staff?.regionId ?? "",
    reportingManagerId: staff?.reportingManagerId ?? "",
    isActive: staff?.isActive ?? true,
    alternatePhone: detail?.alternatePhone ?? "",
    presentCity: detail?.presentCity ?? "",
    dateOfJoining: detail?.dateOfJoining ? new Date(detail.dateOfJoining).toISOString().split("T")[0] : "",
    dateOfExit: detail?.dateOfExit ? new Date(detail.dateOfExit).toISOString().split("T")[0] : "",

    // Tab 2: Personal & Family
    fatherName: detail?.fatherName ?? "",
    motherName: detail?.motherName ?? "",
    dateOfBirth: detail?.dateOfBirth ? new Date(detail.dateOfBirth).toISOString().split("T")[0] : "",
    nationality: detail?.nationality ?? "Indian",
    religionCaste: detail?.religionCaste ?? "",
    maritalStatus: detail?.maritalStatus ?? "",
    permanentAddress: detail?.permanentAddress ?? "",
    communicationAddress: detail?.communicationAddress ?? "",

    // Tab 3: Education
    passOutYear: detail?.passOutYear ? String(detail.passOutYear) : "",
    otherQualification: detail?.otherQualification ?? "",
    otherPassOutYear: detail?.otherPassOutYear ? String(detail.otherPassOutYear) : "",

    // Tab 4: Documents (⬆️ Uploads)
    interviewFormPath: detail?.interviewFormPath ?? "",
    resumePath: detail?.resumePath ?? "",
    photoIdProofPath: detail?.photoIdProofPath ?? "",
    addressProofPath: detail?.addressProofPath ?? "",
    degreeCertificatePath: detail?.degreeCertificatePath ?? "",
    letterOfGuaranteePath: detail?.letterOfGuaranteePath ?? "",
    officeTimeFramePath: detail?.officeTimeFramePath ?? "",
    dailyReportingPath: detail?.dailyReportingPath ?? "",
    leavePolicyPath: detail?.leavePolicyPath ?? "",
  });

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      email: emptyToNull(form.email),
      phone: emptyToNull(form.phone),
      employeeCode: emptyToNull(form.employeeCode),
      designation: emptyToNull(form.designation),
      department: emptyToNull(form.department),
      regionId: form.regionId || undefined,
      reportingManagerId: form.reportingManagerId || undefined,
      isActive: form.isActive,

      alternatePhone: emptyToNull(form.alternatePhone),
      presentCity: emptyToNull(form.presentCity),
      dateOfJoining: form.dateOfJoining ? new Date(form.dateOfJoining) : null,
      dateOfExit: form.dateOfExit ? new Date(form.dateOfExit) : null,

      fatherName: emptyToNull(form.fatherName),
      motherName: emptyToNull(form.motherName),
      dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth) : null,
      nationality: emptyToNull(form.nationality),
      religionCaste: emptyToNull(form.religionCaste),
      maritalStatus: emptyToNull(form.maritalStatus),
      permanentAddress: emptyToNull(form.permanentAddress),
      communicationAddress: emptyToNull(form.communicationAddress),

      passOutYear: form.passOutYear ? parseInt(form.passOutYear, 10) : null,
      otherQualification: emptyToNull(form.otherQualification),
      otherPassOutYear: form.otherPassOutYear ? parseInt(form.otherPassOutYear, 10) : null,

      interviewFormPath: emptyToNull(form.interviewFormPath),
      resumePath: emptyToNull(form.resumePath),
      photoIdProofPath: emptyToNull(form.photoIdProofPath),
      addressProofPath: emptyToNull(form.addressProofPath),
      degreeCertificatePath: emptyToNull(form.degreeCertificatePath),
      letterOfGuaranteePath: emptyToNull(form.letterOfGuaranteePath),
      officeTimeFramePath: emptyToNull(form.officeTimeFramePath),
      dailyReportingPath: emptyToNull(form.dailyReportingPath),
      leavePolicyPath: emptyToNull(form.leavePolicyPath),
    };

    try {
      const res = isEdit
        ? await updateStaff({ id: staff!.id, ...payload } as never)
        : await createStaff(payload as never);

      if (!res.success) {
        setError(res.error ?? "Failed to save staff");
        toast.error(res.error ?? "Failed to save staff");
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
      return;
    } finally {
      setSubmitting(false);
    }

    toast.success(mode === "create" ? "Staff member created successfully" : "Staff details updated successfully");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Staff — ${staff?.name}` : "New Staff Member"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update complete employee details, education, and uploaded HR forms." : "Register a new staff member with HR details and compliance documents."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden flex-1">
          <Tabs defaultValue="employment" className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="grid grid-cols-4 mb-3">
              <TabsTrigger value="employment" className="flex items-center gap-1.5 text-xs">
                <User className="h-3.5 w-3.5" />
                Employment
              </TabsTrigger>
              <TabsTrigger value="personal" className="flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                Personal & Family
              </TabsTrigger>
              <TabsTrigger value="education" className="flex items-center gap-1.5 text-xs">
                <GraduationCap className="h-3.5 w-3.5" />
                Education
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Documents
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto max-h-[55vh] px-1 py-1 space-y-4">
              {/* TAB 1: Employment */}
              <TabsContent value="employment" className="space-y-3 mt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="staff-name">Full Name *</Label>
                    <Input
                      id="staff-name"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      required
                      placeholder="Write Emp. name as per documents"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-code">Emp. ID (Code)</Label>
                    <Input
                      id="staff-code"
                      value={form.employeeCode}
                      onChange={(e) => updateField("employeeCode", e.target.value)}
                      placeholder="Auto generated by system"
                      disabled={isEdit && Boolean(staff?.employeeCode)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-dept">Department</Label>
                    {departments.length > 0 ? (
                      <Select
                        value={form.department}
                        onValueChange={(v) => updateField("department", v ?? "")}
                      >
                        <SelectTrigger id="staff-dept">
                          <SelectValue placeholder="Select Department" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">— None —</SelectItem>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="staff-dept"
                        value={form.department}
                        onChange={(e) => updateField("department", e.target.value)}
                        placeholder="e.g. BLC, GPHCL, Nagarpalika, Corporate sector"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-desig">Designation</Label>
                    {designations.length > 0 ? (
                      <Select
                        value={form.designation}
                        onValueChange={(v) => updateField("designation", v ?? "")}
                      >
                        <SelectTrigger id="staff-desig">
                          <SelectValue placeholder="Select Designation" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">— None —</SelectItem>
                          {designations.map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="staff-desig"
                        value={form.designation}
                        onChange={(e) => updateField("designation", e.target.value)}
                        placeholder="e.g. SR ENG, JR ENG, Ele ENG, Manager, Accountant"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-city">Present City of Working</Label>
                    {cities.length > 0 ? (
                      <Select
                        value={form.presentCity}
                        onValueChange={(v) => updateField("presentCity", v ?? "")}
                      >
                        <SelectTrigger id="staff-city">
                          <SelectValue placeholder="Select City" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">— None —</SelectItem>
                          {cities.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="staff-city"
                        value={form.presentCity}
                        onChange={(e) => updateField("presentCity", e.target.value)}
                        placeholder="e.g. Ahmedabad, Surat, Baroda"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-email">Email ID</Label>
                    <Input
                      id="staff-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-phone">Phone Number</Label>
                    <Input
                      id="staff-phone"
                      value={form.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="Primary phone number"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-alt-phone">Alternate Phone Number</Label>
                    <Input
                      id="staff-alt-phone"
                      value={form.alternatePhone}
                      onChange={(e) => updateField("alternatePhone", e.target.value)}
                      placeholder="Alternate phone number"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-region">Region</Label>
                    <Select
                      value={form.regionId}
                      onValueChange={(v) => updateField("regionId", v ?? "")}
                    >
                      <SelectTrigger id="staff-region">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— None —</SelectItem>
                        {regions.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-manager">Reporting Manager</Label>
                    <Select
                      value={form.reportingManagerId}
                      onValueChange={(v) => updateField("reportingManagerId", v ?? "")}
                    >
                      <SelectTrigger id="staff-manager">
                        <SelectValue placeholder="Select manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— None —</SelectItem>
                        {allStaff
                          .filter((s) => s.id !== staff?.id)
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}{s.designation ? ` (${s.designation})` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-joining">Date of Joining</Label>
                    <Input
                      id="staff-joining"
                      type="date"
                      value={form.dateOfJoining}
                      onChange={(e) => updateField("dateOfJoining", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-exit">Date of Exit</Label>
                    <Input
                      id="staff-exit"
                      type="date"
                      value={form.dateOfExit}
                      onChange={(e) => updateField("dateOfExit", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="staff-status">Status</Label>
                    <Select
                      value={form.isActive ? "true" : "false"}
                      onValueChange={(v) => updateField("isActive", v === "true")}
                    >
                      <SelectTrigger id="staff-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Active</SelectItem>
                        <SelectItem value="false">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: Personal & Family */}
              <TabsContent value="personal" className="space-y-3 mt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fatherName">Father&apos;s Name</Label>
                    <Input
                      id="fatherName"
                      value={form.fatherName}
                      onChange={(e) => updateField("fatherName", e.target.value)}
                      placeholder="Father's full name"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="motherName">Mother&apos;s Name</Label>
                    <Input
                      id="motherName"
                      value={form.motherName}
                      onChange={(e) => updateField("motherName", e.target.value)}
                      placeholder="Mother's full name"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => updateField("dateOfBirth", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input
                      id="nationality"
                      value={form.nationality}
                      onChange={(e) => updateField("nationality", e.target.value)}
                      placeholder="e.g. Indian"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="religionCaste">Religion and Caste</Label>
                    <Input
                      id="religionCaste"
                      value={form.religionCaste}
                      onChange={(e) => updateField("religionCaste", e.target.value)}
                      placeholder="e.g. Hindu / General"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="maritalStatus">Marital Status</Label>
                    <Select
                      value={form.maritalStatus}
                      onValueChange={(v) => updateField("maritalStatus", v ?? "")}
                    >
                      <SelectTrigger id="maritalStatus">
                        <SelectValue placeholder="Select marital status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— None —</SelectItem>
                        <SelectItem value="Single">Single</SelectItem>
                        <SelectItem value="Married">Married</SelectItem>
                        <SelectItem value="Divorced">Divorced</SelectItem>
                        <SelectItem value="Widowed">Widowed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="permanentAddress">Permanent Address</Label>
                    <Textarea
                      id="permanentAddress"
                      value={form.permanentAddress}
                      onChange={(e) => updateField("permanentAddress", e.target.value)}
                      placeholder="Write permanent address as per documents"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="communicationAddress">Communication Address</Label>
                    <Textarea
                      id="communicationAddress"
                      value={form.communicationAddress}
                      onChange={(e) => updateField("communicationAddress", e.target.value)}
                      placeholder="Write current / communication address"
                      rows={2}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* TAB 3: Education */}
              <TabsContent value="education" className="space-y-3 mt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="passOutYear">Degree Pass out Year</Label>
                    <Input
                      id="passOutYear"
                      type="number"
                      value={form.passOutYear}
                      onChange={(e) => updateField("passOutYear", e.target.value)}
                      placeholder="e.g. 2020"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="otherQualification">Other Qualification</Label>
                    <Input
                      id="otherQualification"
                      value={form.otherQualification}
                      onChange={(e) => updateField("otherQualification", e.target.value)}
                      placeholder="e.g. Diploma in Civil Eng., AutoCAD"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="otherPassOutYear">Other Qualification Pass out Year</Label>
                    <Input
                      id="otherPassOutYear"
                      type="number"
                      value={form.otherPassOutYear}
                      onChange={(e) => updateField("otherPassOutYear", e.target.value)}
                      placeholder="e.g. 2022"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* TAB 4: Documents & Compliance */}
              <TabsContent value="documents" className="space-y-3 mt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FileUploadField
                      id="interviewForm"
                      label="Interview Form"
                      value={form.interviewFormPath}
                      onChange={(v) => updateField("interviewFormPath", v)}
                      placeholder="Upload interview form copy"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="resume"
                      label="Resume / CV"
                      value={form.resumePath}
                      onChange={(v) => updateField("resumePath", v)}
                      placeholder="Upload resume"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="photoIdProof"
                      label="Photo ID Proof"
                      value={form.photoIdProofPath}
                      onChange={(v) => updateField("photoIdProofPath", v)}
                      placeholder="Upload Aadhar / PAN / Passport"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="addressProof"
                      label="Address Proof"
                      value={form.addressProofPath}
                      onChange={(v) => updateField("addressProofPath", v)}
                      placeholder="Upload electricity / rent bill"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="degreeCertificate"
                      label="Degree Certificate"
                      value={form.degreeCertificatePath}
                      onChange={(v) => updateField("degreeCertificatePath", v)}
                      placeholder="Upload degree / diploma certificate"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="letterOfGuarantee"
                      label="Letter of Guarantee"
                      value={form.letterOfGuaranteePath}
                      onChange={(v) => updateField("letterOfGuaranteePath", v)}
                      placeholder="Upload guarantee letter"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="officeTimeFrame"
                      label="Office Time Frame (Annexure - A)"
                      value={form.officeTimeFramePath}
                      onChange={(v) => updateField("officeTimeFramePath", v)}
                      placeholder="Upload signed Annexure - A"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FileUploadField
                      id="dailyReporting"
                      label="Daily Reporting (Form - 2)"
                      value={form.dailyReportingPath}
                      onChange={(v) => updateField("dailyReportingPath", v)}
                      placeholder="Upload signed Form - 2"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <FileUploadField
                      id="leavePolicy"
                      label="Leave Policy (Form - 3)"
                      value={form.leavePolicyPath}
                      onChange={(v) => updateField("leavePolicyPath", v)}
                      placeholder="Upload signed Form - 3"
                    />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <ErrorBanner error={error} onAskAi={(e) => askAi(e, mode === "create" ? "Creating staff member" : "Editing staff member")} askingAi={askingAi} aiResponse={aiResponse} />

          <div className="flex justify-end gap-2 pt-3 border-t mt-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Staff"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


