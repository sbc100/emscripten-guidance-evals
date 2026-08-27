#!/usr/bin/env python3
"""Automated evaluation harness for benchmarking AI coding agents on Emscripten.

This script sets up workspaces for each evaluation test case,
runs agents with and without access to Emscripten guidance (best practices),
verifies build outcomes, and evaluates the generated solutions.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
TESTS_DIR = ROOT_DIR / "tests"
GUIDANCE_DIR = ROOT_DIR / "guidance"
EVALUATION_DIR = ROOT_DIR / "evaluation"
DEFAULT_RESULTS_DIR = ROOT_DIR / "results"


def get_all_tests() -> list[str]:
    """Return a list of all available test directory names."""
    if not TESTS_DIR.exists():
        return []
    return [
        d.name
        for d in sorted(TESTS_DIR.iterdir())
        if d.is_dir() and not d.name.startswith(".")
    ]


def get_results_dirs() -> list[Path]:
    """Return all existing results directories sorted by version."""
    dirs: list[tuple[int, Path]] = []
    if not ROOT_DIR.exists():
        return []
    for d in ROOT_DIR.iterdir():
        if not d.is_dir():
            continue
        if d.name == "results":
            dirs.append((0, d))
        else:
            m = re.match(r"^results_(\d+)$", d.name)
            if m:
                dirs.append((int(m.group(1)), d))
    dirs.sort(key=lambda x: x[0])
    return [d[1] for d in dirs]


def get_latest_results_dir() -> Path:
    """Return the latest results directory, or default to results_001."""
    dirs = get_results_dirs()
    if dirs:
        return dirs[-1]
    return ROOT_DIR / "results_001"


def get_next_results_dir() -> Path:
    """Compute the next unused results_<num> directory (e.g. results_001)."""
    max_idx = 0
    for d in ROOT_DIR.iterdir():
        if not d.is_dir():
            continue
        m = re.match(r"^results_(\d+)$", d.name)
        if m:
            max_idx = max(max_idx, int(m.group(1)))
    next_idx = max_idx + 1
    return ROOT_DIR / f"results_{next_idx:03d}"


def resolve_results_dir(
    target: str | Path | None, default_to_new: bool = False
) -> Path:
    """Resolve the target results directory based on arguments."""
    if target:
        p = Path(target)
        return p if p.is_absolute() else ROOT_DIR / p
    if default_to_new:
        return get_next_results_dir()
    return get_latest_results_dir()


def generate_index_html(results_dir: Path) -> None:
    """Generate an index.html navigation page for a results directory."""
    tests = get_all_tests()
    rows = []
    for test in tests:
        guided_html = results_dir / test / "guided" / "index.html"
        guided_log = results_dir / test / "guided" / "run.log"
        unguided_html = results_dir / test / "unguided" / "index.html"
        unguided_log = results_dir / test / "unguided" / "run.log"
        report_md = results_dir / test / "evaluation_report.md"

        guided_parts = []
        if guided_html.exists():
            guided_parts.append(f'<a href="{test}/guided/index.html">Guided</a>')
        if guided_log.exists():
            guided_parts.append(f'<a href="{test}/guided/run.log">log</a>')
        guided_link = " | ".join(guided_parts) if guided_parts else "Guided"

        unguided_parts = []
        if unguided_html.exists():
            unguided_parts.append(f'<a href="{test}/unguided/index.html">Unguided</a>')
        if unguided_log.exists():
            unguided_parts.append(f'<a href="{test}/unguided/run.log">log</a>')
        unguided_link = " | ".join(unguided_parts) if unguided_parts else "Unguided"

        report_link = (
            f'<a href="{test}/evaluation_report.md">Report</a>'
            if report_md.exists()
            else "Report"
        )
        rows.append(
            f"      <tr>\n"
            f"        <td>{test}</td>\n"
            f"        <td>{guided_link}</td>\n"
            f"        <td>{unguided_link}</td>\n"
            f"        <td>{report_link}</td>\n"
            f"      </tr>"
        )

    tbody = "\n".join(rows)
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Emscripten Guidance Evaluation Results ({results_dir.name})</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
      line-height: 1.5;
      color: #24292f;
    }}
    @media (prefers-color-scheme: dark) {{
      body {{
        background-color: #0d1117;
        color: #c9d1d9;
      }}
      table th {{
        background-color: #161b22;
        border-color: #30363d;
      }}
      table td {{
        border-color: #30363d;
      }}
      a {{
        color: #58a6ff;
      }}
    }}
    h1 {{
      margin-bottom: 1.5rem;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }}
    th, td {{
      border: 1px solid #d0d7de;
      padding: 8px 12px;
      text-align: left;
    }}
    th {{
      background-color: #f6f8fa;
    }}
    a {{
      color: #0969da;
      text-decoration: none;
    }}
    a:hover {{
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <h1>Emscripten Guidance Evaluation Results ({results_dir.name})</h1>
  <table>
    <thead>
      <tr>
        <th>Test Case</th>
        <th>Guided</th>
        <th>Unguided</th>
        <th>Report</th>
      </tr>
    </thead>
    <tbody>
{tbody}
    </tbody>
  </table>
</body>
</html>
"""
    (results_dir / "index.html").write_text(html_content, encoding="utf-8")


def prepare_workspace(test: str, mode: str, target_dir: Path) -> str:
    """Populate target_dir with prompt and guidance; return agent prompt text."""
    target_dir.mkdir(parents=True, exist_ok=True)
    test_dir = TESTS_DIR / test
    prompt_file = test_dir / "prompt.md"
    if not prompt_file.exists():
        raise FileNotFoundError(f"Prompt file not found for test '{test}'")

    prompt_text = prompt_file.read_text(encoding="utf-8")
    (target_dir / "prompt.md").write_text(prompt_text, encoding="utf-8")

    if mode == "guided":
        guided_guidance = target_dir / "guidance"
        if guided_guidance.exists():
            shutil.rmtree(guided_guidance)
        shutil.copytree(GUIDANCE_DIR, guided_guidance)

        agent_prompt = (
            f"# Task: {test}\n\n"
            "You MUST read and follow the Emscripten best practices "
            "in `./guidance/best_practices.rst` and "
            "`./guidance/cpp-on-the-web/guide.md` before generating "
            "any code or Makefile.\n\n"
            f"{prompt_text}"
        )
    else:
        agent_prompt = prompt_text

    (target_dir / "agent_prompt.md").write_text(agent_prompt, encoding="utf-8")
    return agent_prompt


def sync_workspace_dir(src: Path, dst: Path) -> None:
    """Sync all files and directories from src to dst, preserving symlinks."""
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        dest = dst / item.name
        try:
            if item.is_dir() and not item.is_symlink():
                if dest.exists() or dest.is_symlink():
                    if dest.is_dir() and not dest.is_symlink():
                        shutil.rmtree(dest)
                    else:
                        dest.unlink()
                shutil.copytree(
                    item,
                    dest,
                    symlinks=True,
                    ignore_dangling_symlinks=True,
                )
            else:
                if dest.exists() or dest.is_symlink():
                    if dest.is_dir() and not dest.is_symlink():
                        shutil.rmtree(dest)
                    else:
                        dest.unlink()
                shutil.copy2(item, dest, follow_symlinks=False)
        except OSError as e:
            print(f"Warning: Failed to copy {item.name}: {e}")


def create_isolated_env(temp_home: Path) -> dict[str, str]:
    """Create a sanitized environment dictionary with an isolated HOME directory."""
    temp_home.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["HOME"] = str(temp_home)
    env["HISTFILE"] = "/dev/null"
    env["HISTSIZE"] = "0"

    # Remove variables that could leak outer workspace paths, git or shell history
    for var in [
        "OLDPWD",
        "PWD",
        "GEMINI_CLI_WORKSPACE_DIR",
        "WORKSPACE_ROOT",
        "GIT_DIR",
        "GIT_WORK_TREE",
    ]:
        env.pop(var, None)

    if "ANTIGRAVITY_PROJECT_ID" not in env:
        env["ANTIGRAVITY_PROJECT_ID"] = "default-cli-project"

    return env


def wait_for_agentapi_conversation(
    conversation_id: str,
    timeout_seconds: int = 1200,
    poll_interval: float = 2.0,
    temp_home: Path | None = None,
) -> bool:
    """Poll the agent transcript log until completion or timeout."""
    candidate_paths = []
    if temp_home:
        candidate_paths.append(
            temp_home
            / ".gemini"
            / "jetski"
            / "brain"
            / conversation_id
            / ".system_generated"
            / "logs"
            / "transcript.jsonl"
        )
    candidate_paths.append(
        Path.home()
        / ".gemini"
        / "jetski"
        / "brain"
        / conversation_id
        / ".system_generated"
        / "logs"
        / "transcript.jsonl"
    )

    print(f"Waiting for agent conversation {conversation_id} to finish...")
    start_time = time.time()
    last_reported_step = -1

    while True:
        elapsed = time.time() - start_time
        if elapsed > timeout_seconds:
            print(
                f"\nTimed out waiting for conversation {conversation_id} "
                f"after {elapsed:.0f}s."
            )
            return False

        transcript_path = next((p for p in candidate_paths if p.exists()), None)
        if transcript_path:
            try:
                raw = transcript_path.read_text(encoding="utf-8").strip()
                if raw:
                    lines = [
                        json.loads(line)
                        for line in raw.splitlines()
                        if line.strip()
                    ]
                    if lines:
                        last_step = lines[-1]
                        step_idx = last_step.get("step_index", len(lines) - 1)
                        step_type = last_step.get("type", "")
                        source = last_step.get("source", "")
                        status = last_step.get("status", "")
                        tool_calls = last_step.get("tool_calls", [])
                        content = last_step.get("content", "")

                        # Check if any recent background task is still running
                        has_running = any(
                            s.get("status") == "RUNNING" for s in lines[-10:]
                        )

                        # Check if model finished its response
                        if (
                            source == "MODEL"
                            and step_type == "PLANNER_RESPONSE"
                            and status == "DONE"
                            and not tool_calls
                            and content
                            and not has_running
                        ):
                            print(
                                f"\n  Completed conversation {conversation_id} "
                                f"in {elapsed:.1f}s ({len(lines)} steps)."
                            )
                            return True

                        if step_idx != last_reported_step:
                            last_reported_step = step_idx
                            tool_desc = ""
                            if tool_calls:
                                tool_desc = (
                                    f": {tool_calls[0].get('name', 'tool')}"
                                )
                            elif content:
                                tool_desc = ": generating final response"
                            print(
                                f"\r  [{elapsed:4.0f}s] Step {step_idx:3d}"
                                f"{tool_desc:<30}",
                                end="",
                                flush=True,
                            )
            except (json.JSONDecodeError, OSError, UnicodeDecodeError):
                pass

        time.sleep(poll_interval)


def format_duration(seconds: float) -> str:
    """Format duration into human readable string (e.g. 45.2s or 1m 35.2s)."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    m, s = divmod(int(seconds), 60)
    frac = seconds - int(seconds)
    return f"{m}m {s + frac:04.1f}s ({seconds:.1f}s)"


def print_timing_summary(
    timing_data: dict[tuple[str, str], float],
    total_elapsed: float,
) -> None:
    """Print execution timing breakdown and total elapsed time."""
    if not timing_data:
        print(f"\nTotal elapsed time: {format_duration(total_elapsed)}")
        return

    tests_seen: list[str] = []
    for test, _ in timing_data:
        if test not in tests_seen:
            tests_seen.append(test)

    rows: list[tuple[str, str, str, str]] = []
    for test in tests_seen:
        u_time = timing_data.get((test, "unguided"))
        g_time = timing_data.get((test, "guided"))
        u_str = format_duration(u_time) if u_time is not None else "N/A"
        g_str = format_duration(g_time) if g_time is not None else "N/A"
        if u_time is not None or g_time is not None:
            t_time = (u_time or 0.0) + (g_time or 0.0)
            t_str = format_duration(t_time)
        else:
            t_str = "N/A"
        rows.append((test, u_str, g_str, t_str))

    headers = ("Test Case", "Unguided", "Guided", "Total")
    col_widths = [
        max(len(headers[i]), *(len(row[i]) for row in rows))
        for i in range(len(headers))
    ]

    header_line = " | ".join(
        f"{h:<{w}}" if i < len(headers) - 1 else h
        for i, (h, w) in enumerate(zip(headers, col_widths, strict=True))
    )
    divider = "-" * len(header_line)

    print("\n=== Execution Timing ===")
    print(header_line)
    print(divider)
    for row in rows:
        line = " | ".join(
            f"{val:<{w}}" if i < len(row) - 1 else val
            for i, (val, w) in enumerate(zip(row, col_widths, strict=True))
        )
        print(line)
    print(divider)
    print(f"Total time taken: {format_duration(total_elapsed)}")


def summarize_transcript(transcript_path: Path) -> tuple[list[str], str]:
    """Parse transcript.jsonl and extract high-level tool calls and final LLM response."""
    steps_summary: list[str] = []
    final_response: str = ""
    try:
        raw = transcript_path.read_text(encoding="utf-8").strip()
        if not raw:
            return steps_summary, final_response
        lines = [json.loads(line) for line in raw.splitlines() if line.strip()]
        for entry in lines:
            source = entry.get("source", "")
            step_type = entry.get("type", "")
            step_idx = entry.get("step_index", 0)
            tool_calls = entry.get("tool_calls", [])
            content = entry.get("content", "")

            if source == "MODEL" and step_type == "PLANNER_RESPONSE":
                if tool_calls:
                    for tc in tool_calls:
                        name = tc.get("name", "tool")
                        args = tc.get("args", {})
                        summary = tc.get("toolSummary") or tc.get("toolAction")
                        detail = ""
                        if name == "run_command":
                            cmd = str(args.get("CommandLine", "")).strip("\"'")
                            detail = f"`{cmd}`"
                        elif name in ("write_to_file", "replace_file_content"):
                            tgt = str(args.get("TargetFile", "")).strip("\"'")
                            tgt_name = Path(tgt).name if tgt else ""
                            desc = str(
                                args.get("Instruction")
                                or args.get("Description")
                                or ""
                            ).strip("\"'")
                            detail = tgt_name + (f" ({desc})" if desc else "")
                        elif summary:
                            detail = str(summary).strip("\"'")

                        desc_str = (
                            f"Step {step_idx:2d}: Tool `{name}`: {detail}"
                            if detail
                            else f"Step {step_idx:2d}: Tool `{name}`"
                        )
                        steps_summary.append(desc_str)
                elif content:
                    final_response = content.strip()
    except (
        json.JSONDecodeError,
        OSError,
        UnicodeDecodeError,
        KeyError,
        IndexError,
        TypeError,
    ) as e:
        steps_summary.append(f"Error parsing transcript: {e}")
    return steps_summary, final_response


def write_run_log(
    workspace: Path,
    test: str,
    mode: str,
    runner: str,
    duration: float,
    start_time: float,
    end_time: float,
    captured_output: str = "",
    transcript_path: Path | None = None,
) -> None:
    """Write run.log with timing metadata, high-level LLM activity, and output."""
    start_dt = datetime.fromtimestamp(
        start_time, tz=timezone.utc
    ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
    end_dt = datetime.fromtimestamp(
        end_time, tz=timezone.utc
    ).astimezone().strftime("%Y-%m-%d %H:%M:%S")

    sections = [
        "=" * 80,
        f"Evaluation Run Log: {test} ({mode})",
        "=" * 80,
        f"Runner:         {runner}",
        f"Execution Time: {format_duration(duration)}",
        f"DurationSec:    {duration:.2f}",
        f"Started:        {start_dt}",
        f"Completed:      {end_dt}",
        "=" * 80,
    ]

    steps_summary = []
    final_response = ""
    if transcript_path and transcript_path.exists():
        steps_summary, final_response = summarize_transcript(transcript_path)

    if steps_summary:
        sections.append("\n=== High-Level LLM Activity ===")
        sections.extend(steps_summary)

    if final_response:
        sections.append("\n=== Final LLM Response ===")
        sections.append(final_response)

    if captured_output and captured_output.strip():
        sections.append("\n=== Runner Console Output ===")
        sections.append(captured_output.strip())

    sections.append("")
    log_content = "\n".join(sections)
    log_file = workspace / "run.log"
    log_file.write_text(log_content, encoding="utf-8")


def run_agent(
    tests: list[str],
    runner: str,
    results_dir: Path,
    async_mode: bool = False,
    timeout: int = 1200,
) -> dict[tuple[str, str], float]:
    """Run the specified agent runner across test cases in isolated /tmp workspaces."""
    results_dir.mkdir(parents=True, exist_ok=True)
    timing_data: dict[tuple[str, str], float] = {}

    for test in tests:
        for mode in ["unguided", "guided"]:
            step_start = time.time()
            workspace = results_dir / test / mode

            print(
                f"\n--- Running [{runner}] on {test} ({mode}) [{results_dir.name}] ---"
            )

            temp_dir_obj = (
                tempfile.TemporaryDirectory(
                    prefix=f"emscripten_eval_{test}_{mode}_"
                )
                if not async_mode
                else None
            )
            temp_dir_path = (
                Path(temp_dir_obj.name)
                if temp_dir_obj
                else Path(
                    tempfile.mkdtemp(prefix=f"emscripten_eval_{test}_{mode}_")
                )
            )

            try:
                temp_workspace = temp_dir_path / "workspace"
                temp_home = temp_dir_path / "home"
                temp_workspace.mkdir(parents=True, exist_ok=True)
                temp_home.mkdir(parents=True, exist_ok=True)

                # Prepare test workspace directly in /tmp
                prompt_content = prepare_workspace(test, mode, temp_workspace)

                captured_lines = []
                transcript_path = None

                if runner == "print":
                    print(f"Target directory: {workspace}")
                    print(f"Prompt:\n{prompt_content[:300]}...\n")
                    continue

                env = create_isolated_env(temp_home)
                print(f"Isolated workspace: {temp_workspace}")
                print(f"Isolated HOME: {temp_home}")

                if runner == "agentapi":
                    agentapi_bin = shutil.which("agentapi")
                    if not agentapi_bin:
                        default_path = (
                            Path.home()
                            / ".gemini"
                            / "jetski"
                            / "bin"
                            / "agentapi"
                        )
                        if default_path.exists():
                            agentapi_bin = str(default_path)
                    if not agentapi_bin:
                        print(
                            "Error: 'agentapi' CLI not found in PATH or "
                            "~/.gemini/jetski/bin/agentapi.\n"
                            "Please ensure Jetski is installed or add "
                            "~/.gemini/jetski/bin to PATH."
                        )
                        continue

                    cmd = [
                        agentapi_bin,
                        "new-conversation",
                        f"--title={test} ({mode})",
                        prompt_content,
                    ]
                    print(
                        f"Executing: {' '.join(cmd[:3])} '<prompt>' in {temp_workspace}"
                    )
                    res = subprocess.run(
                        cmd,
                        cwd=temp_workspace,
                        env=env,
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                    if res.stdout:
                        captured_lines.append(res.stdout)
                    if res.stderr:
                        captured_lines.append(res.stderr)

                    if res.returncode != 0:
                        print(f"Error starting conversation: {res.stderr}")
                        continue

                    conversation_id = None
                    try:
                        data = json.loads(res.stdout)
                        conversation_id = (
                            data.get("response", {})
                            .get("newConversation", {})
                            .get("conversationId")
                        )
                    except (json.JSONDecodeError, AttributeError):
                        match = re.search(
                            r'"conversationId":\s*"([^"]+)"', res.stdout
                        )
                        if match:
                            conversation_id = match.group(1)

                    if not conversation_id:
                        print(
                            f"Failed to extract conversationId from output:\n"
                            f"{res.stdout}"
                        )
                        continue

                    print(f"Started conversation: {conversation_id}")
                    if not async_mode:
                        wait_for_agentapi_conversation(
                            conversation_id,
                            timeout_seconds=timeout,
                            temp_home=temp_home,
                        )
                        cand = (
                            temp_home
                            / ".gemini"
                            / "jetski"
                            / "brain"
                            / conversation_id
                            / ".system_generated"
                            / "logs"
                            / "transcript.jsonl"
                        )
                        if cand.exists():
                            transcript_path = cand
                elif runner in ("jetski-cli", "jetski"):
                    jetski_bin = shutil.which("jetski-cli") or shutil.which(
                        "jetski"
                    )
                    if not jetski_bin:
                        release_path = Path(
                            "/google/bin/releases/jetski-devs/tools/cli"
                        )
                        if release_path.exists():
                            jetski_bin = str(release_path)
                        else:
                            default_path = (
                                Path.home()
                                / ".gemini"
                                / "jetski"
                                / "bin"
                                / "jetski"
                            )
                            if default_path.exists():
                                jetski_bin = str(default_path)
                    if not jetski_bin:
                        print(
                            "Error: Jetski CLI not found in PATH or "
                            "/google/bin/releases/jetski-devs/tools/cli.\n"
                            "Please ensure Jetski CLI is installed."
                        )
                        continue

                    timeout_str = f"{timeout}s"
                    cmd = [
                        jetski_bin,
                        "--isolated_env",
                        "--new-project",
                        "--dangerously-skip-permissions",
                        f"--print-timeout={timeout_str}",
                        "-p",
                        prompt_content,
                    ]
                    print(f"Executing Jetski CLI in {temp_workspace}...")
                    proc = subprocess.Popen(
                        cmd,
                        cwd=temp_workspace,
                        env=env,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1,
                    )
                    if proc.stdout:
                        for line in proc.stdout:
                            print(line, end="", flush=True)
                            captured_lines.append(line)
                    proc.wait()

                    transcripts = list(
                        temp_home.glob(
                            ".gemini/jetski/brain/*/.system_generated/logs/transcript.jsonl"
                        )
                    )
                    if transcripts:
                        transcript_path = max(
                            transcripts, key=lambda p: p.stat().st_mtime
                        )
                elif runner in ("gemini", "claude"):
                    cmd = [runner, "-p", prompt_content]
                    print(f"Executing {runner} CLI in {temp_workspace}")
                    proc = subprocess.Popen(
                        cmd,
                        cwd=temp_workspace,
                        env=env,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1,
                    )
                    if proc.stdout:
                        for line in proc.stdout:
                            print(line, end="", flush=True)
                            captured_lines.append(line)
                    proc.wait()
                elif runner == "mock":
                    print(
                        f"Generating mock baseline solution for {test} ({mode})..."
                    )
                    generate_mock_solution(temp_workspace, mode, test)
                    captured_lines.append(
                        f"Generated mock baseline solution for {test} ({mode}).\n"
                    )
                else:
                    print(f"Unknown runner: {runner}")
                    continue

                if not async_mode:
                    end_time = time.time()
                    duration = end_time - step_start
                    timing_data[(test, mode)] = duration
                    captured_output = "".join(captured_lines)
                    write_run_log(
                        workspace=temp_workspace,
                        test=test,
                        mode=mode,
                        runner=runner,
                        duration=duration,
                        start_time=step_start,
                        end_time=end_time,
                        captured_output=captured_output,
                        transcript_path=transcript_path,
                    )
                    sync_workspace_dir(temp_workspace, workspace)
                    print(
                        f"Finished {test} ({mode}) in {format_duration(duration)} "
                        f"(synced to {workspace})"
                    )
                else:
                    print(
                        f"Async run launched in {temp_workspace}. "
                        f"Artifacts will remain at {temp_dir_path} until synced."
                    )
            finally:
                if temp_dir_obj:
                    temp_dir_obj.cleanup()

    generate_index_html(results_dir)
    return timing_data


def generate_mock_solution(workspace: Path, mode: Path | str, test: str) -> None:
    """Generate a simulated solution to verify the build and grading harness."""
    mode_str = str(mode)
    if mode_str == "guided":
        # Generate a fully compliant solution following best_practices.rst
        makefile_content = """CC = emcc
CXX = em++

CFLAGS = -Wall -Werror -sSTRICT
CXXFLAGS = $(CFLAGS)

LDFLAGS = -sEXPORT_ES6 \\
          -sMODULARIZE \\
          -sEXPORT_NAME=Module \\
          -sALLOW_MEMORY_GROWTH \\
          -sENVIRONMENT=web \\
          --bind

TARGET = module.mjs
SRCS = main.cpp
OBJS = $(SRCS:.cpp=.o)

all: $(TARGET)

$(TARGET): $(OBJS)
\t$(CXX) $(OBJS) $(LDFLAGS) -o $(TARGET)

%.o: %.cpp
\t$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
\trm -f $(TARGET) module.wasm module.mjs.map $(OBJS)

.PHONY: all clean
"""
        cpp_content = """#include <emscripten/bind.h>
#include <iostream>
#include <vector>
#include <string>

std::vector<uint8_t> processBuffer(const std::vector<uint8_t>& input) {
    std::vector<uint8_t> output = input;
    // Mock processing loop
    for (size_t i = 0; i < output.size(); ++i) {
        output[i] = output[i] ^ 0x55;
    }
    return output;
}

EMSCRIPTEN_BINDINGS(processor_module) {
    emscripten::function("processBuffer", &processBuffer);
}

int main() {
    std::cout << "C++ Module initialized cleanly." << std::endl;
    return 0;
}
"""
        html_content = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Guided Solution</title></head>
<body>
    <h1>Guided Emscripten Web App</h1>
    <script type="module">
        import Module from './module.mjs';
        Module().then(instance => {
            console.log("Module loaded:", instance);
        });
    </script>
</body>
</html>
"""
    else:
        # Generate an unguided solution using legacy/deprecated flags
        makefile_content = """all:
\tem++ -O2 main.cpp -o module.js -sUSE_PTHREADS=1 -sWASM=1 -sEXPORTED_FUNCTIONS=['_main','_process'] -sALLOW_MEMORY_GROWTH=1
clean:
\trm -f module.js module.wasm
"""
        cpp_content = """#include <iostream>
extern "C" {
    void process(char* buf, int len) {
        for(int i=0; i<len; ++i) buf[i] ^= 0x55;
    }
}
int main() {
    std::cout << "Legacy module running." << std::endl;
    return 0;
}
"""
        html_content = """<!DOCTYPE html>
<html>
<head><title>Unguided App</title></head>
<body>
    <script src="module.js"></script>
</body>
</html>
"""

    (workspace / "Makefile").write_text(makefile_content, encoding="utf-8")
    (workspace / "main.cpp").write_text(cpp_content, encoding="utf-8")
    (workspace / "index.html").write_text(html_content, encoding="utf-8")
    print(f"Mock files written to {workspace}")


def build_workspaces(tests: list[str], results_dir: Path) -> None:
    """Run make or emcc inside generated workspaces to verify build status."""
    emsdk_path = ROOT_DIR.parent / "emsdk" / "emsdk_env.sh"
    source_cmd = (
        f"source {emsdk_path} >/dev/null 2>&1 && " if emsdk_path.exists() else ""
    )

    for test in tests:
        for mode in ["unguided", "guided"]:
            workspace = results_dir / test / mode
            if not workspace.exists() or not (workspace / "Makefile").exists():
                continue

            print(f"Building {test} ({mode}) in {workspace}...")
            log_file = workspace / "build.log"
            cmd = f"{source_cmd}make clean all"
            with open(log_file, "w", encoding="utf-8") as f:
                res = subprocess.run(
                    cmd,
                    cwd=workspace,
                    shell=True,
                    executable="/bin/bash",
                    stdout=f,
                    stderr=subprocess.STDOUT,
                    check=False,
                )

            status = "PASS" if res.returncode == 0 else "FAIL"
            print(f"  Build outcome: {status} (log: {log_file})")


def evaluate_tests(tests: list[str], results_dir: Path) -> None:
    """Evaluate and grade the generated solutions against best practices."""
    for test in tests:
        scores = {}
        analysis_notes = {}

        for mode in ["unguided", "guided"]:
            workspace = results_dir / test / mode
            if not workspace.exists() or not (workspace / "Makefile").exists():
                scores[mode] = 0
                analysis_notes[mode] = "Workspace or Makefile missing."
                continue

            makefile = (workspace / "Makefile").read_text(encoding="utf-8")
            cpp = ""
            for p in workspace.glob("*.cpp"):
                cpp += p.read_text(encoding="utf-8")
            html = ""
            for p in workspace.glob("*.html"):
                html += p.read_text(encoding="utf-8")

            score = 0
            notes = []

            # Category 1: Basic Functionality & Testing (25 pts)
            cat1 = 0
            if (workspace / "module.wasm").exists() or list(
                workspace.glob("*.wasm")
            ):
                cat1 += 10
            if (workspace / "index.html").exists() and len(
                (workspace / "index.html").read_text(encoding="utf-8")
            ) > 100:
                cat1 += 10
            if (workspace / "module.mjs").exists() or list(
                workspace.glob("*.mjs")
            ):
                cat1 += 5
            score += min(cat1, 25)
            notes.append(f"Basic Functionality & Testing: {cat1}/25")

            # Category 2: Compilation Flags (25 pts)
            cat2 = 0
            if "-sSTRICT" in makefile and "-sSTRICT=1" not in makefile:
                cat2 += 8
            if "-sEXPORT_ES6" in makefile and "-sEXPORT_ES6=1" not in makefile:
                cat2 += 8
            if "-Werror" in makefile and "-Wall" in makefile:
                cat2 += 5
            if (
                "-sWASM=1" not in makefile
                and "-sUSE_PTHREADS=1" not in makefile
            ):
                cat2 += 4
            score += min(cat2, 25)
            notes.append(f"Compilation Flags: {cat2}/25")

            # Category 3: Separate Compilation (25 pts)
            cat3 = 0
            if "-c " in makefile and (
                "%.o: %.cpp" in makefile or ".o" in makefile
            ):
                cat3 += 15
            if "-flto" in makefile or "-O3" in makefile or "-Oz" in makefile:
                cat3 += 10
            score += min(cat3, 25)
            notes.append(f"Separate Compilation: {cat3}/25")

            # Category 4: JS & C++ Interop (Embind) & Web Standards (25 pts)
            cat4 = 0
            if "--bind" in makefile and "EMSCRIPTEN_BINDINGS" in cpp:
                cat4 += 15
            elif "extern " in cpp or "EXPORTED_FUNCTIONS" in makefile:
                cat4 += 5
            if 'type="module"' in html or "import Module" in html:
                cat4 += 10
            score += min(cat4, 25)
            notes.append(f"JS & C++ Interop: {cat4}/25")

            scores[mode] = score
            analysis_notes[mode] = "; ".join(notes)

        unguided_score = scores.get("unguided", 0)
        guided_score = scores.get("guided", 0)
        uplift = guided_score - unguided_score

        # Read execution times from run.log if available
        unguided_log = results_dir / test / "unguided" / "run.log"
        guided_log = results_dir / test / "guided" / "run.log"
        unguided_time = "N/A"
        guided_time = "N/A"

        if unguided_log.exists():
            for line in unguided_log.read_text(encoding="utf-8").splitlines():
                if line.startswith("Execution Time:"):
                    unguided_time = line.split("Execution Time:")[1].strip()
                    break

        if guided_log.exists():
            for line in guided_log.read_text(encoding="utf-8").splitlines():
                if line.startswith("Execution Time:"):
                    guided_time = line.split("Execution Time:")[1].strip()
                    break

        report_path = results_dir / test / "evaluation_report.md"
        report_content = f"""# Evaluation Report: {test}

## Executive Summary
- **Unguided Score:** {unguided_score} / 100
- **Guided Score:** {guided_score} / 100
- **Uplift (+pp):** {uplift:+d} points
- **Unguided Time:** {unguided_time}
- **Guided Time:** {guided_time}

## Detailed Notes
### Unguided Run
- **Score:** {unguided_score}/100
- **Execution Time:** {unguided_time}
- **Notes:** {analysis_notes.get('unguided', 'N/A')}

### Guided Run
- **Score:** {guided_score}/100
- **Execution Time:** {guided_time}
- **Notes:** {analysis_notes.get('guided', 'N/A')}
"""
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report_content, encoding="utf-8")
        print(f"Wrote evaluation report: {report_path}")

    generate_summary_metrics(results_dir)
    generate_index_html(results_dir)


def generate_summary_metrics(results_dir: Path) -> None:
    """Generate or update summary_metrics.md from all existing evaluation reports."""
    tests = get_all_tests()
    summary_rows = []

    for test in tests:
        report_path = results_dir / test / "evaluation_report.md"
        if not report_path.exists():
            continue

        lines = report_path.read_text(encoding="utf-8").splitlines()
        unguided_score = None
        guided_score = None
        unguided_time = None
        guided_time = None

        for line in lines:
            if "Unguided Score:" in line:
                m = re.search(r"(\d+)\s*/\s*100", line)
                if m:
                    unguided_score = int(m.group(1))
            elif "Guided Score:" in line:
                m = re.search(r"(\d+)\s*/\s*100", line)
                if m:
                    guided_score = int(m.group(1))
            elif line.startswith("- **Unguided Time:**"):
                unguided_time = line.split("Unguided Time:**")[1].strip()
            elif line.startswith("- **Guided Time:**"):
                guided_time = line.split("Guided Time:**")[1].strip()

        if unguided_score is not None and guided_score is not None:
            uplift = guided_score - unguided_score
            summary_rows.append(
                (
                    test,
                    unguided_score,
                    guided_score,
                    uplift,
                    unguided_time or "N/A",
                    guided_time or "N/A",
                )
            )

    if summary_rows:
        has_times = any(r[4] != "N/A" or r[5] != "N/A" for r in summary_rows)
        name_w = max(16, *(len(r[0]) for r in summary_rows))

        if has_times:
            u_time_w = max(13, *(len(r[4]) for r in summary_rows))
            g_time_w = max(11, *(len(r[5]) for r in summary_rows))
            header = (
                f"| {'Test Case':<{name_w}} | {'Unguided Score':<14} | "
                f"{'Guided Score':<12} | {'Uplift (+pp)':<12} | "
                f"{'Unguided Time':<{u_time_w}} | {'Guided Time':<{g_time_w}} |"
            )
            divider = (
                f"| :{(name_w - 1)*'-'} | :{12*'-'}: | :{10*'-'}: | :{10*'-'}: | "
                f":{(u_time_w - 1)*'-'} | :{(g_time_w - 1)*'-'} |"
            )
            formatted_rows = [
                f"| {t:<{name_w}} | {u!s:^14} | {g!s:^12} | {f'{up:+d}':^12} | "
                f"{ut:<{u_time_w}} | {gt:<{g_time_w}} |"
                for t, u, g, up, ut, gt in summary_rows
            ]
        else:
            header = (
                f"| {'Test Case':<{name_w}} | {'Unguided Score':<14} | "
                f"{'Guided Score':<12} | {'Uplift (+pp)':<12} |"
            )
            divider = (
                f"| :{(name_w - 1)*'-'} | :{12*'-'}: | :{10*'-'}: | :{10*'-'}: |"
            )
            formatted_rows = [
                f"| {t:<{name_w}} | {u!s:^14} | {g!s:^12} | {f'{up:+d}':^12} |"
                for t, u, g, up, _, _ in summary_rows
            ]

        summary_file = results_dir / "summary_metrics.md"
        summary_md = (
            f"# Emscripten Guidance AI Agent Evaluation Metrics ({results_dir.name})\n\n"
            + header
            + "\n"
            + divider
            + "\n"
            + "\n".join(formatted_rows)
            + "\n"
        )
        summary_file.write_text(summary_md, encoding="utf-8")
        print(f"\nWrote summary metrics: {summary_file}")


def print_status(results_dir: Path | None = None) -> None:
    """Print status table of all test workspaces."""
    if results_dir is None:
        target_dirs = get_results_dirs()
        if not target_dirs:
            print("No results directories found.")
            return
    else:
        target_dirs = [results_dir]

    tests = get_all_tests()
    if not tests:
        print("No tests found.")
        return

    for rdir in target_dirs:
        print(f"\n=== Emscripten Evaluation Status [{rdir.name}] ===")
        print(
            f"{'Test Case':<20} | {'Mode':<10} | {'Makefile':<10} | {'Build':<8} | {'Score':<8}"
        )
        print("-" * 65)

        for test in tests:
            for mode in ["unguided", "guided"]:
                workspace = rdir / test / mode
                has_makefile = (workspace / "Makefile").exists()
                build_log = workspace / "build.log"
                build_status = "N/A"
                if build_log.exists():
                    txt = build_log.read_text(encoding="utf-8")
                    build_status = (
                        "FAIL" if "error:" in txt.lower() else "PASS"
                    )
                elif has_makefile and (workspace / "module.mjs").exists():
                    build_status = "PASS"

                score = "N/A"
                report = rdir / test / "evaluation_report.md"
                if report.exists():
                    lines = report.read_text(encoding="utf-8").splitlines()
                    for line in lines:
                        if f"{mode.capitalize()} Score:" in line:
                            score = (
                                line.split("Score:")[1]
                                .split("/")[0]
                                .replace("*", "")
                                .strip()
                                + "/100"
                            )
                            break

                print(
                    f"{test:<20} | {mode:<10} | "
                    f"{'Yes' if has_makefile else 'No':<10} | "
                    f"{build_status:<8} | {score:<8}"
                )


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Automated Emscripten AI Agent Evaluation Harness"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # run
    run_p = subparsers.add_parser("run", help="Run agent on workspaces")
    run_p.add_argument(
        "--runner",
        choices=[
            "print",
            "agentapi",
            "jetski-cli",
            "jetski",
            "gemini",
            "claude",
            "mock",
        ],
        default="jetski-cli",
        help="Runner engine to execute (default: jetski-cli)",
    )
    run_p.add_argument("--test", help="Specific test name")
    run_p.add_argument(
        "-d",
        "--results-dir",
        help="Target results directory (default: new results_xxx)",
    )
    run_p.add_argument(
        "--async",
        dest="async_mode",
        action="store_true",
        help="Launch agent without waiting for completion",
    )
    run_p.add_argument(
        "--timeout",
        type=int,
        default=1200,
        help="Maximum seconds to wait for agent completion (default: 1200)",
    )

    # build
    build_p = subparsers.add_parser(
        "build", help="Run make inside test workspaces"
    )
    build_p.add_argument("--test", help="Specific test name")
    build_p.add_argument(
        "-d",
        "--results-dir",
        help="Target results directory (default: latest results directory)",
    )

    # evaluate
    eval_p = subparsers.add_parser(
        "evaluate", help="Evaluate and score outputs"
    )
    eval_p.add_argument("--test", help="Specific test name")
    eval_p.add_argument(
        "-d",
        "--results-dir",
        help="Target results directory (default: latest results directory)",
    )

    # summarize
    sum_p = subparsers.add_parser(
        "summarize",
        help="Re-generate summary_metrics.md from all existing reports",
    )
    sum_p.add_argument(
        "-d",
        "--results-dir",
        help="Target results directory (default: latest results directory)",
    )

    # all
    all_p = subparsers.add_parser(
        "all",
        help="Run full pipeline (run -> build -> evaluate)",
    )
    all_p.add_argument(
        "--runner",
        choices=[
            "print",
            "agentapi",
            "jetski-cli",
            "jetski",
            "gemini",
            "claude",
            "mock",
        ],
        default="jetski-cli",
        help="Runner engine to execute (default: jetski-cli)",
    )
    all_p.add_argument(
        "--test", help="Specific test name (or all by default)"
    )
    all_p.add_argument(
        "-d",
        "--results-dir",
        help="Target results directory (default: new results_xxx)",
    )
    all_p.add_argument(
        "--async",
        dest="async_mode",
        action="store_true",
        help="Launch agent without waiting for completion",
    )
    all_p.add_argument(
        "--timeout",
        type=int,
        default=1200,
        help="Maximum seconds to wait for agent completion (default: 1200)",
    )

    # status
    status_p = subparsers.add_parser(
        "status", help="Show status of test workspaces"
    )
    status_p.add_argument(
        "-d",
        "--results-dir",
        help="Target results directory (default: all results directories)",
    )

    args = parser.parse_args()
    tests = [args.test] if getattr(args, "test", None) else get_all_tests()
    start_time = time.time()

    if args.command == "run":
        target_dir = resolve_results_dir(
            args.results_dir, default_to_new=bool(not args.results_dir)
        )
        timing_data = run_agent(
            tests,
            args.runner,
            results_dir=target_dir,
            async_mode=args.async_mode,
            timeout=args.timeout,
        )
        if not args.async_mode:
            total_elapsed = time.time() - start_time
            print_timing_summary(timing_data, total_elapsed)
    elif args.command == "build":
        target_dir = resolve_results_dir(args.results_dir, default_to_new=False)
        build_workspaces(tests, target_dir)
        total_elapsed = time.time() - start_time
        print(f"\nTotal build time: {format_duration(total_elapsed)}")
    elif args.command == "evaluate":
        target_dir = resolve_results_dir(args.results_dir, default_to_new=False)
        evaluate_tests(tests, target_dir)
        total_elapsed = time.time() - start_time
        print(f"\nTotal evaluate time: {format_duration(total_elapsed)}")
    elif args.command == "summarize":
        target_dir = resolve_results_dir(args.results_dir, default_to_new=False)
        generate_summary_metrics(target_dir)
        total_elapsed = time.time() - start_time
        print(f"\nTotal summarize time: {format_duration(total_elapsed)}")
    elif args.command == "all":
        target_dir = resolve_results_dir(
            args.results_dir,
            default_to_new=bool(not args.results_dir),
        )
        timing_data = run_agent(
            tests,
            args.runner,
            results_dir=target_dir,
            async_mode=args.async_mode,
            timeout=args.timeout,
        )
        if not args.async_mode:
            build_workspaces(tests, target_dir)
            evaluate_tests(tests, target_dir)
            print_status(target_dir)
            total_elapsed = time.time() - start_time
            print_timing_summary(timing_data, total_elapsed)
    elif args.command == "status":
        target_dir = (
            resolve_results_dir(args.results_dir, default_to_new=False)
            if args.results_dir
            else None
        )
        print_status(target_dir)


if __name__ == "__main__":
    main()
