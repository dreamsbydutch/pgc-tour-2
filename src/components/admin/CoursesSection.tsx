import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { CourseDoc } from "../../../convex/types/types";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Field, normalizeList } from "./shared";

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

export function CoursesSection() {
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

  const isEditing = !!form.courseId;

  function resetForm() {
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
  }

  function loadCourse(c: CourseDoc) {
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
  }

  async function onDelete(c: CourseDoc) {
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
  }

  async function onSubmit(e: React.FormEvent) {
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

    if (!apiId) return setError("API ID is required.");
    if (!name) return setError("Name is required.");
    if (!location) return setError("Location is required.");
    if (
      !Number.isFinite(par) ||
      !Number.isFinite(front) ||
      !Number.isFinite(back)
    ) {
      return setError("Par/front/back must be numbers.");
    }
    if (!Number.isFinite(timeZoneOffset)) {
      return setError("Time zone offset must be a number.");
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
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Update Course" : "Create Course"}</CardTitle>
          <CardDescription>Basic course info for tournaments.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="API ID">
                <input
                  value={form.apiId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, apiId: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Location">
                <input
                  value={form.location}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Time zone offset">
                <input
                  inputMode="numeric"
                  value={form.timeZoneOffset}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      timeZoneOffset: e.target.value,
                    }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Par">
                <input
                  inputMode="numeric"
                  value={form.par}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, par: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Front 9">
                <input
                  inputMode="numeric"
                  value={form.front}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, front: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Back 9">
                <input
                  inputMode="numeric"
                  value={form.back}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, back: e.target.value }))
                  }
                  disabled={submitting}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? (
              <p className="text-sm text-green-700">{success}</p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : isEditing ? "Update" : "Create"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={submitting}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Courses</CardTitle>
          <CardDescription>Click “Edit” to load.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDataTable<CourseDoc>
            rows={courses}
            emptyMessage="No courses found."
            columns={[
              { id: "name", header: "Name", cell: (c) => c.name },
              { id: "loc", header: "Location", cell: (c) => c.location },
              { id: "par", header: "Par", cell: (c) => c.par },
              {
                id: "actions",
                header: "",
                headClassName: "w-[1%]",
                cell: (c) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadCourse(c)}
                      disabled={submitting}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void onDelete(c)}
                      disabled={submitting}
                    >
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
