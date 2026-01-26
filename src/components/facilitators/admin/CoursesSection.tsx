import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex";
import type { Id } from "@/convex";
import type { CourseDoc } from "../../../../convex/types/types";
import { AdminEditDeleteActions } from "@/displays";
import { AdminCrudSection } from "./AdminCrudSection";
import { Card, CardContent, CardHeader, Field, Skeleton } from "@/ui";
import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { adminActionsColumn } from "@/lib/adminTable";
import { normalizeList } from "@/lib/utils";

/**
 * Admin UI for creating, updating, and deleting courses.
 *
 * Data sources:
 * - Convex query for courses.
 * - Convex mutations for create/update/delete.
 *
 * Major render states:
 * - Loading: shows a skeleton until the courses list is available.
 * - Ready: shows a create/update form and a table of existing courses.
 *
 * @returns Courses management section.
 */
export function CoursesSection() {
  const model = useCoursesSection();

  if (model.status === "loading") return <CoursesSectionSkeleton />;

  return (
    <AdminCrudSection<CourseDoc>
      formTitle={model.isEditing ? "Update Course" : "Create Course"}
      formDescription="Basic course info for tournaments."
      formFields={
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="API ID">
            <input
              value={model.form.apiId}
              onChange={(e) => model.updateField("apiId", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>
          <Field label="Name">
            <input
              value={model.form.name}
              onChange={(e) => model.updateField("name", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>
          <Field label="Location">
            <input
              value={model.form.location}
              onChange={(e) => model.updateField("location", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>
          <Field label="Time zone offset">
            <input
              inputMode="numeric"
              value={model.form.timeZoneOffset}
              onChange={(e) =>
                model.updateField("timeZoneOffset", e.target.value)
              }
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>
          <Field label="Par">
            <input
              inputMode="numeric"
              value={model.form.par}
              onChange={(e) => model.updateField("par", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>
          <Field label="Front 9">
            <input
              inputMode="numeric"
              value={model.form.front}
              onChange={(e) => model.updateField("front", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>
          <Field label="Back 9">
            <input
              inputMode="numeric"
              value={model.form.back}
              onChange={(e) => model.updateField("back", e.target.value)}
              disabled={model.submitting}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            />
          </Field>
        </div>
      }
      formError={model.error}
      formSuccess={model.success}
      submitting={model.submitting}
      primaryActionLabel={
        model.submitting ? "Saving…" : model.isEditing ? "Update" : "Create"
      }
      secondaryActionLabel="Reset"
      onSecondaryAction={model.resetForm}
      onSubmit={model.onSubmit}
      tableTitle="Existing Courses"
      tableDescription="Click “Edit” to load."
      tableRows={model.courses}
      tableEmptyMessage="No courses found."
      tableColumns={[
        { id: "name", header: "Name", cell: (c) => c.name },
        { id: "loc", header: "Location", cell: (c) => c.location },
        { id: "par", header: "Par", cell: (c) => c.par },
        adminActionsColumn((c) => (
          <AdminEditDeleteActions
            onEdit={() => model.loadCourse(c)}
            onDelete={() => void model.onDelete(c)}
            disabled={model.submitting}
          />
        )),
      ]}
    />
  );
}

/**
 * Fetches and manages state for `CoursesSection`.
 *
 * @returns View-model used by the UI for CRUD actions and display state.
 */
function useCoursesSection() {
  type CourseFormState = {
    courseId: Id<"courses"> | "";
    apiId: string;
    name: string;
    location: string;
    par: string;
    front: string;
    back: string;
    timeZoneOffset: string;
  };

  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        courses: CourseDoc[];
        form: CourseFormState;
        isEditing: boolean;
        submitting: boolean;
        error: string | null;
        success: string | null;
        updateField: <K extends keyof CourseFormState>(
          key: K,
          value: CourseFormState[K],
        ) => void;
        resetForm: () => void;
        loadCourse: (c: CourseDoc) => void;
        onDelete: (c: CourseDoc) => Promise<void>;
        onSubmit: (e: FormEvent) => Promise<void>;
      };

  const createCourse = useMutation(api.functions.courses.createCourses);
  const updateCourse = useMutation(api.functions.courses.updateCourses);
  const deleteCourse = useMutation(api.functions.courses.deleteCourses);

  const coursesResult = useQuery(api.functions.courses.getCourses, {
    options: {
      pagination: { limit: 500, offset: 0 },
      sort: { sortBy: "name", sortOrder: "asc" },
    },
  });

  const courses = useMemo(() => {
    return normalizeList<CourseDoc, "courses">(
      coursesResult as unknown,
      "courses",
    );
  }, [coursesResult]);

  const [form, setForm] = useState<CourseFormState>({
    courseId: "",
    apiId: "",
    name: "",
    location: "",
    par: "72",
    front: "36",
    back: "36",
    timeZoneOffset: "0",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEditing = Boolean(form.courseId);

  const updateField = <K extends keyof CourseFormState>(
    key: K,
    value: CourseFormState[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetForm = () => {
    setForm({
      courseId: "",
      apiId: "",
      name: "",
      location: "",
      par: "72",
      front: "36",
      back: "36",
      timeZoneOffset: "0",
    });
    setError(null);
    setSuccess(null);
  };

  const loadCourse = (c: CourseDoc) => {
    setForm({
      courseId: c._id,
      apiId: c.apiId,
      name: c.name,
      location: c.location,
      par: `${c.par}`,
      front: `${c.front}`,
      back: `${c.back}`,
      timeZoneOffset: `${c.timeZoneOffset}`,
    });
    setError(null);
    setSuccess(null);
  };

  const onDelete = async (c: CourseDoc) => {
    setError(null);
    setSuccess(null);

    const ok = window.confirm(`Delete course “${c.name}”?`);
    if (!ok) return;

    setSubmitting(true);
    try {
      await deleteCourse({ courseId: c._id });
      setSuccess("Course deleted.");
      if (form.courseId === c._id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete course");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const apiId = form.apiId.trim();
    const name = form.name.trim();
    const location = form.location.trim();

    const par = Math.trunc(Number(form.par));
    const front = Math.trunc(Number(form.front));
    const back = Math.trunc(Number(form.back));
    const timeZoneOffset = Number(form.timeZoneOffset);

    if (!apiId) {
      setError("API ID is required.");
      return;
    }
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!location) {
      setError("Location is required.");
      return;
    }
    if (
      !Number.isFinite(par) ||
      !Number.isFinite(front) ||
      !Number.isFinite(back)
    ) {
      setError("Par/front/back must be numbers.");
      return;
    }
    if (!Number.isFinite(timeZoneOffset)) {
      setError("Time zone offset must be a number.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        await updateCourse({
          courseId: form.courseId as Id<"courses">,
          data: { apiId, name, location, par, front, back, timeZoneOffset },
          options: { skipValidation: false },
        });
        setSuccess("Course updated.");
      } else {
        await createCourse({
          data: { apiId, name, location, par, front, back, timeZoneOffset },
          options: { skipValidation: false },
        });
        setSuccess("Course created.");
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save course");
    } finally {
      setSubmitting(false);
    }
  };

  const isStillLoading = coursesResult === undefined;
  if (isStillLoading) return { status: "loading" } as const satisfies Model;

  return {
    status: "ready",
    courses,
    form,
    isEditing,
    submitting,
    error,
    success,
    updateField,
    resetForm,
    loadCourse,
    onDelete,
    onSubmit,
  } as const satisfies Model;
}

/**
 * Loading UI for `CoursesSection`.
 */
function CoursesSectionSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
