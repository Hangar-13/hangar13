"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { godListUsersPaginated, type GodUserListRow } from "@/app/actions/god-users";
import { AddGodUserDialog } from "@/components/god/add-god-user-dialog";
import { LeadBadge } from "@/components/god/lead-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 20;
const searchDebounceMs = 400;

type GodUsersPageClientProps = {
  initialRows: GodUserListRow[];
  initialTotal: number;
  orgOptions: { id: string; name: string }[];
};

export function GodUsersPageClient({
  initialRows,
  initialTotal,
  orgOptions,
}: GodUsersPageClientProps) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<GodUserListRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [addOpen, setAddOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const skipNextFetch = useRef(true);

  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = (page + 1) * PAGE_SIZE < total;

  const load = useCallback((searchArg: string, pageArg: number) => {
    startTransition(() => {
      void (async () => {
        const res = await godListUsersPaginated({
          search: searchArg,
          page: pageArg,
          pageSize: PAGE_SIZE,
        });
        if (!res.ok) {
          return;
        }
        setRows(res.rows);
        setTotal(res.total);
      })();
    });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(q);
    }, searchDebounceMs);
    return () => clearTimeout(t);
  }, [q]);

  const prevSearch = useRef(search);
  useEffect(() => {
    if (prevSearch.current !== search) {
      prevSearch.current = search;
      setPage(0);
    }
  }, [search]);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    load(search, page);
  }, [search, page, load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Manage Users</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email, name, or organization…"
            type="search"
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="w-full gap-1.5 sm:w-fit shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add New User
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[56rem] table-fixed text-sm">
          <colgroup>
            {/* Fixed narrow role; last column absorbs the rest (wide for long org names). */}
            <col className="w-[24%] min-w-0" />
            <col className="w-[18%] min-w-0" />
            <col className="w-24" />
            <col className="min-w-0" />
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Name</th>
              <th className="p-2 sm:p-3 font-medium whitespace-nowrap">Role</th>
              <th className="p-3 font-medium">Organizations</th>
            </tr>
          </thead>
          <tbody>
            {isPending && rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer"
                >
                  <td className="p-0 align-top min-w-0">
                    <Link
                      href={`/dashboard/god/users/${r.id}`}
                      className="block p-3 text-foreground break-words"
                    >
                      {r.email || "—"}
                    </Link>
                  </td>
                  <td className="p-0 align-top min-w-0">
                    <Link
                      href={`/dashboard/god/users/${r.id}`}
                      className="block p-3 break-words"
                    >
                      {r.fullName?.trim() || "—"}
                    </Link>
                  </td>
                  <td className="p-0 align-top whitespace-nowrap">
                    <Link
                      href={`/dashboard/god/users/${r.id}`}
                      className="block p-2 sm:p-3 capitalize text-muted-foreground"
                    >
                      {r.role}
                    </Link>
                  </td>
                  <td className="p-0 align-top min-w-0">
                    <Link
                      href={`/dashboard/god/users/${r.id}`}
                      className="block p-3 text-muted-foreground min-w-0 break-words"
                    >
                      {r.organizations.length === 0 ? (
                        "—"
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          {r.organizations.map((o, i) => (
                            <Fragment key={`${r.id}-${o.name}-${i}`}>
                              {i > 0 ? (
                                <span className="text-muted-foreground/80" aria-hidden>
                                  ,{" "}
                                </span>
                              ) : null}
                              <span className="inline-flex items-center gap-1">
                                <span>{o.name}</span>
                                {o.isLead ? <LeadBadge /> : null}
                              </span>
                            </Fragment>
                          ))}
                        </span>
                      )}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
          <span>
            Showing {total === 0 ? 0 : page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canPrev || isPending}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="self-center tabular-nums">
              Page {page + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canNext || isPending}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AddGodUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        orgOptions={orgOptions}
        onCreated={() => {
          setAddOpen(false);
          setQ("");
          setSearch("");
          setPage(0);
          load("", 0);
          router.refresh();
        }}
      />
    </div>
  );
}
