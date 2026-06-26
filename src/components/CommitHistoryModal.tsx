import { Background, Controls, Handle, type NodeProps, Position, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createLocalBranch, fetchLocalCommit, fetchLocalRepoHistory } from "../api/github";
import { useI18n } from "../i18n/I18nProvider";
import type {
  HistoryOrder,
  LocalCommitDetail,
  LocalCommitNode,
  LocalRepo,
  LocalRepoHistory,
} from "../types/github";
import { COL_W, layoutCommits, ROW_H } from "../utils/commitGraph";
import {
  FIT_MAX_ZOOM,
  HANDLE_DOT_OFFSET,
  laneColor,
  MIN_ZOOM,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "../utils/commitGraphConfig";
import { errorMessage } from "../utils/errors";
import { formatRelativeTime } from "../utils/format";
import { ChevronIcon } from "./common/Icons";
import { Modal } from "./common/Modal";

interface CommitHistoryModalProps {
  repo: LocalRepo;
  onClose: () => void;
}

/** Data carried by each React Flow commit node. */
interface CommitNodeData {
  commit: LocalCommitNode;
  isHead: boolean;
  selected: boolean;
  /** Lane color, so the dot matches its branch's edge color. */
  color: string;
  [key: string]: unknown;
}

// Pin both edge handles to the commit dot's center (a fixed offset from the node's
// left edge) instead of React Flow's default node-center. Nodes are variable-width
// (they size to the subject), so center-anchored handles would misalign vertically
// stacked commits and force the edges into S-curves; dot-anchoring keeps same-lane
// edges perfectly straight, leaving elbows only for real branch/merge crossings.
const HANDLE_AT_DOT = { left: HANDLE_DOT_OFFSET } as const;

/** A single commit rendered in the graph: dot, short SHA, subject, and ref badges.
 * Memoized so only nodes whose data identity actually changed (e.g. the newly
 * selected one) re-render — selection doesn't churn the whole graph. */
const CommitNode = memo(function CommitNode({ data }: NodeProps) {
  const { commit, isHead, selected, color } = data as CommitNodeData;
  return (
    // The full subject lives in the side panel + this hover title; the node face
    // stays compact (dot + short SHA + any ref badge) so the graph reads cleanly.
    <div className={`commit-node${selected ? " selected" : ""}`} title={commit.subject}>
      <Handle
        type="target"
        position={Position.Top}
        className="commit-handle"
        style={HANDLE_AT_DOT}
      />
      <span className={`commit-dot${isHead ? " head" : ""}`} style={{ backgroundColor: color }} />
      <span className="commit-sha">{commit.sha.slice(0, 7)}</span>
      {commit.refs.length ? (
        <span className="commit-refs">
          {commit.refs.map((ref) => (
            <span key={ref} className={`commit-ref${ref === "HEAD" ? " head" : ""}`}>
              {ref}
            </span>
          ))}
        </span>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="commit-handle"
        style={HANDLE_AT_DOT}
      />
    </div>
  );
});

// Stable reference — React Flow warns when nodeTypes is a fresh object each render.
const nodeTypes = { commit: CommitNode };

/** Glyph for a file's change status (A/M/D/…). */
function statusGlyph(status: string): string {
  switch (status) {
    case "A":
      return "+";
    case "D":
      return "−";
    case "M":
      return "~";
    default:
      return status;
  }
}

/** Added/removed line counts (or a "binary" badge) for one changed file. */
function FileStat({
  additions,
  deletions,
}: {
  additions: number | null;
  deletions: number | null;
}) {
  const { t } = useI18n();
  if (additions == null && deletions == null) {
    return <span className="bin">{t("history.binary")}</span>;
  }
  return (
    <>
      {additions != null ? <span className="add">+{additions}</span> : null}
      {deletions != null ? <span className="del">−{deletions}</span> : null}
    </>
  );
}

/**
 * Right pane: the selected commit's message + changed files, plus the
 * create-branch-from-here affordance. Owns its own detail fetch and branch-form
 * state, keyed by `sha`, so the modal stays focused on the graph + selection.
 */
function CommitDetailPanel({
  repoPath,
  sha,
  onBranchCreated,
}: {
  repoPath: string;
  sha: string;
  /** Called after a branch is created so the graph can refresh its refs. */
  onBranchCreated: () => void;
}) {
  const { language, t } = useI18n();
  const [detail, setDetail] = useState<LocalCommitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filesOpen, setFilesOpen] = useState(true);

  const [branchOpen, setBranchOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [branchError, setBranchError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setBranchOpen(false);
    setBranchError("");
    fetchLocalCommit(repoPath, sha, controller.signal)
      .then((data) => !controller.signal.aborted && setDetail(data))
      .catch((err: unknown) => !controller.signal.aborted && setError(errorMessage(err)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [repoPath, sha]);

  const createBranch = () => {
    if (!branchName.trim()) return;
    setCreating(true);
    setBranchError("");
    createLocalBranch(repoPath, sha, branchName.trim())
      .then(() => {
        setBranchOpen(false);
        setBranchName("");
        onBranchCreated();
      })
      .catch((err: unknown) => setBranchError(errorMessage(err)))
      .finally(() => setCreating(false));
  };

  if (loading) return <div className="history-status">{t("common.loading")}</div>;
  if (error) return <div className="history-status error">{error}</div>;
  if (!detail) return null;

  return (
    <>
      <div className="history-detail-head">
        <code className="history-sha">{detail.commit.sha.slice(0, 10)}</code>
        <div className="history-meta">
          <span className="history-author">{detail.commit.author}</span>
          <span className="history-date">
            {formatRelativeTime(detail.commit.authorDate, Date.now(), language)}
          </span>
        </div>
      </div>

      <pre className="history-message">{detail.commit.message}</pre>

      <button
        type="button"
        className={`history-files-head${filesOpen ? " open" : ""}`}
        onClick={() => setFilesOpen((o) => !o)}
        aria-expanded={filesOpen}
      >
        <span className="history-files-chevron">
          <ChevronIcon />
        </span>
        {t("history.changedFiles", { count: detail.files.length })}
      </button>
      {filesOpen ? (
        <ul className="history-files">
          {detail.files.map((file) => (
            <li key={file.path} className="history-file">
              <span className={`history-file-status status-${file.status}`}>
                {statusGlyph(file.status)}
              </span>
              <span className="history-file-path" title={file.path}>
                {file.path}
              </span>
              <span className="history-file-stat">
                <FileStat additions={file.additions} deletions={file.deletions} />
              </span>
            </li>
          ))}
          {detail.files.length === 0 ? (
            <li className="history-status">{t("history.noChanges")}</li>
          ) : null}
        </ul>
      ) : null}

      <div className="history-branch">
        {branchOpen ? (
          <div className="history-branch-form">
            <input
              type="text"
              className="history-branch-input"
              placeholder={t("history.branchName")}
              value={branchName}
              // biome-ignore lint/a11y/noAutofocus: focus the input the user just revealed
              autoFocus
              disabled={creating}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createBranch()}
            />
            <div className="history-branch-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setBranchOpen(false)}
                disabled={creating}
              >
                {t("history.cancel")}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={createBranch}
                disabled={creating || !branchName.trim()}
              >
                {creating ? t("history.creating") : t("history.create")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn primary" onClick={() => setBranchOpen(true)}>
            {t("history.createBranch")}
          </button>
        )}
        {branchError ? <div className="history-status error">{branchError}</div> : null}
      </div>
    </>
  );
}

/**
 * Full-screen commit-history explorer for one local repo. Left pane is the DAG
 * (React Flow, fed by the pure {@link layoutCommits}); right pane (see
 * {@link CommitDetailPanel}) shows the selected commit and offers branch creation.
 */
export function CommitHistoryModal({ repo, onClose }: CommitHistoryModalProps) {
  const { t } = useI18n();
  const [history, setHistory] = useState<LocalRepoHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [order, setOrder] = useState<HistoryOrder>("date");

  const loadHistory = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError("");
      return fetchLocalRepoHistory(repo.path, order, signal)
        .then((data) => {
          if (signal?.aborted) return;
          setHistory(data);
          // Default the selection to HEAD (or the newest commit) on first load.
          setSelectedSha((current) => current ?? data.head ?? data.commits[0]?.sha ?? null);
        })
        .catch((err: unknown) => {
          if (!signal?.aborted) setLoadError(errorMessage(err));
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [repo.path, order],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  const graph = useMemo(() => layoutCommits(history?.commits ?? []), [history]);
  const head = history?.head ?? null;

  // Lane index per SHA, so an edge can take its child's branch color.
  const laneBySha = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.lane])),
    [graph],
  );

  // Base nodes are independent of selection, so selecting a commit doesn't rebuild
  // (and re-render) the whole graph.
  const baseNodes = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "commit",
        position: node.position,
        // Declared size → React Flow skips per-node measurement (the O(n) cost at
        // scale) and keeps fitView/culling accurate; the visual node may overflow it.
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: {
          commit: node.data,
          isHead: node.id === head,
          selected: false,
          color: laneColor(node.lane),
        } satisfies CommitNodeData,
      })),
    [graph, head],
  );

  // Inject `selected` onto just the chosen node — every other node keeps its object
  // identity, so memoized CommitNodes skip re-rendering on selection change.
  const rfNodes = useMemo(
    () =>
      baseNodes.map((node) =>
        node.id === selectedSha ? { ...node, data: { ...node.data, selected: true } } : node,
      ),
    [baseNodes, selectedSha],
  );

  const rfEdges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        // Straight lines (the convergent git-graph style); with dot-anchored handles
        // same-lane edges are vertical and only branch/merge edges angle.
        type: "straight",
        // Color by the child (source) lane so each branch is one continuous line.
        style: { stroke: laneColor(laneBySha.get(edge.source) ?? 0), strokeWidth: 2 },
      })),
    [graph, laneBySha],
  );

  return (
    <Modal
      className="history-modal"
      ariaLabel={t("history.title")}
      onClose={onClose}
      title={
        <>
          <span className="modal-icon repository">⎇</span>
          <div style={{ minWidth: 0 }}>
            <div className="kind">{t("history.title")}</div>
            <h3>{repo.name}</h3>
          </div>
        </>
      }
    >
      <div className="history-body">
        <div className="history-graph">
          {loading ? (
            <div className="history-status">{t("common.loading")}</div>
          ) : loadError ? (
            <div className="history-status error">{loadError}</div>
          ) : graph.nodes.length === 0 ? (
            <div className="history-status">{t("history.noCommits")}</div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodeClick={(_event, node) => setSelectedSha(node.id)}
              nodesDraggable={false}
              nodesConnectable={false}
              fitView
              fitViewOptions={{ maxZoom: FIT_MAX_ZOOM }}
              // Allow zooming out far enough to take in a tall history at a glance.
              minZoom={MIN_ZOOM}
              // Cull off-screen nodes so tall histories stay responsive.
              onlyRenderVisibleElements
              // Theme the built-in Controls/Background for our dark UI.
              colorMode="dark"
            >
              <Background gap={Math.min(COL_W, ROW_H)} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
          {graph.nodes.length > 0 ? (
            <div className="history-order">
              {/* chrono vs topological ordering */}
              <button
                type="button"
                className={`history-order-btn${order === "date" ? " active" : ""}`}
                onClick={() => setOrder("date")}
              >
                {t("history.orderDate")}
              </button>
              <button
                type="button"
                className={`history-order-btn${order === "topo" ? " active" : ""}`}
                onClick={() => setOrder("topo")}
              >
                {t("history.orderTopo")}
              </button>
            </div>
          ) : null}
          {graph.nodes.length > 0 ? (
            <div className="history-graph-meta">
              {t("history.commitCount", { count: graph.nodes.length })}
              {history?.truncated ? ` · ${t("history.olderHidden")}` : ""}
            </div>
          ) : null}
        </div>

        <aside className="history-detail">
          {selectedSha ? (
            <CommitDetailPanel
              repoPath={repo.path}
              sha={selectedSha}
              onBranchCreated={loadHistory}
            />
          ) : (
            <div className="history-status">{t("history.selectPrompt")}</div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
