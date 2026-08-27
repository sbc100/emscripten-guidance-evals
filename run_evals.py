#!/usr/bin/env python3
"""Automated evaluation harness for benchmarking AI coding agents on Emscripten.

This script sets up isolated git repositories for each evaluation test case,
runs agents with and without access to Emscripten guidance (best practices),
verifies build outcomes, and evaluates the generated solutions.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
TESTS_DIR = ROOT_DIR / "tests"
GUIDANCE_DIR = ROOT_DIR / "guidance"
EVALUATION_DIR = ROOT_DIR / "evaluation"
RESULTS_DIR = ROOT_DIR / "results"


def get_all_tests() -> list[str]:
    """Return a list of all available test directory names."""
    if not TESTS_DIR.exists():
        return []
    return [
        d.name
        for d in sorted(TESTS_DIR.iterdir())
        if d.is_dir() and not d.name.startswith(".")
    ]


def setup_tests(tests: list[str]) -> None:
    """Set up unguided and guided workspaces for the specified tests."""
    for test in tests:
        test_dir = TESTS_DIR / test
        prompt_file = test_dir / "prompt.md"
        if not prompt_file.exists():
            print(f"Warning: Prompt file not found for test '{test}', skipping.")
            continue

        prompt_text = prompt_file.read_text(encoding="utf-8")

        for mode in ["unguided", "guided"]:
            workspace = RESULTS_DIR / test / mode
            if workspace.exists():
                shutil.rmtree(workspace)
            workspace.mkdir(parents=True, exist_ok=True)

            # Initialize a fresh git repository in the workspace
            subprocess.run(
                ["git", "init", "-q"],
                cwd=workspace,
                check=True,
            )

            # Create a basic .gitignore
            gitignore_path = workspace / ".gitignore"
            gitignore_path.write_text(
                "*.o\n*.wasm\n*.mjs\n*.mjs.map\nbuild.log\n",
                encoding="utf-8",
            )

            # Copy prompt into workspace
            (workspace / "prompt.md").write_text(prompt_text, encoding="utf-8")

            if mode == "guided":
                # Copy guidance folder into the guided workspace so the agent
                # has direct local access to the docs
                guided_guidance = workspace / "guidance"
                if guided_guidance.exists():
                    shutil.rmtree(guided_guidance)
                shutil.copytree(GUIDANCE_DIR, guided_guidance)

                # Create an enhanced prompt for guided mode
                guided_prompt = (
                    f"# Task: {test}\n\n"
                    "You MUST read and follow the Emscripten best practices "
                    "in `./guidance/best_practices.rst` and "
                    "`./guidance/cpp-on-the-web/guide.md` before generating "
                    "any code or Makefile.\n\n"
                    f"{prompt_text}"
                )
                (workspace / "agent_prompt.md").write_text(
                    guided_prompt, encoding="utf-8"
                )
            else:
                (workspace / "agent_prompt.md").write_text(
                    prompt_text, encoding="utf-8"
                )

            print(f"Set up workspace: {workspace}")


def wait_for_agentapi_conversation(
    conversation_id: str,
    timeout_seconds: int = 600,
    poll_interval: float = 2.0,
) -> bool:
    """Poll the agent transcript log until completion or timeout."""
    transcript_path = (
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

        if transcript_path.exists():
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


def run_agent(
    tests: list[str],
    runner: str,
    async_mode: bool = False,
    timeout: int = 600,
) -> None:
    """Run the specified agent runner across the test workspaces."""
    for test in tests:
        for mode in ["unguided", "guided"]:
            workspace = RESULTS_DIR / test / mode
            if not workspace.exists():
                print(
                    f"Workspace {workspace} does not exist. Run 'setup' first."
                )
                continue

            prompt_path = workspace / "agent_prompt.md"
            prompt_content = prompt_path.read_text(encoding="utf-8")

            print(f"\n--- Running [{runner}] on {test} ({mode}) ---")

            if runner == "print":
                print(f"Directory: {workspace}")
                print(f"Prompt:\n{prompt_content[:300]}...\n")
            elif runner == "agentapi":
                agentapi_bin = shutil.which("agentapi")
                if not agentapi_bin:
                    default_path = (
                        Path.home() / ".gemini" / "jetski" / "bin" / "agentapi"
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

                env = os.environ.copy()
                if "ANTIGRAVITY_PROJECT_ID" not in env:
                    env["ANTIGRAVITY_PROJECT_ID"] = "default-cli-project"

                cmd = [
                    agentapi_bin,
                    "new-conversation",
                    f"--title={test} ({mode})",
                    prompt_content,
                ]
                print(
                    f"Executing: {' '.join(cmd[:3])} '<prompt>' in {workspace}"
                )
                res = subprocess.run(
                    cmd,
                    cwd=workspace,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=False,
                )

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
                        conversation_id, timeout_seconds=timeout
                    )
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
                    "--dangerously-skip-permissions",
                    f"--print-timeout={timeout_str}",
                    "-p",
                    prompt_content,
                ]
                print(f"Executing Jetski CLI in {workspace}...")
                subprocess.run(cmd, cwd=workspace, check=False)
            elif runner == "gemini":
                cmd = ["gemini", "-p", prompt_content]
                print(f"Executing gemini CLI in {workspace}")
                subprocess.run(cmd, cwd=workspace, check=False)
            elif runner == "claude":
                cmd = ["claude", "-p", prompt_content]
                print(f"Executing claude CLI in {workspace}")
                subprocess.run(cmd, cwd=workspace, check=False)
            elif runner == "mock":
                print(f"Generating mock baseline solution for {test} ({mode})...")
                generate_mock_solution(workspace, mode, test)
            else:
                print(f"Unknown runner: {runner}")


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


def build_workspaces(tests: list[str]) -> None:
    """Run make or emcc inside generated workspaces to verify build status."""
    emsdk_path = ROOT_DIR.parent / "emsdk" / "emsdk_env.sh"
    source_cmd = f"source {emsdk_path} >/dev/null 2>&1 && " if emsdk_path.exists() else ""

    for test in tests:
        for mode in ["unguided", "guided"]:
            workspace = RESULTS_DIR / test / mode
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


def evaluate_tests(tests: list[str]) -> None:
    """Evaluate and grade the generated solutions against best practices."""
    for test in tests:
        test_dir = TESTS_DIR / test
        criteria_file = test_dir / "evaluation_criteria.md"
        _ = (
            criteria_file.read_text(encoding="utf-8")
            if criteria_file.exists()
            else ""
        )

        scores = {}
        analysis_notes = {}

        for mode in ["unguided", "guided"]:
            workspace = RESULTS_DIR / test / mode
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

            # Category 1: Compilation Flags (25 pts)
            cat1 = 0
            if "-sSTRICT" in makefile and "-sSTRICT=1" not in makefile:
                cat1 += 8
            if "-sEXPORT_ES6" in makefile and "-sEXPORT_ES6=1" not in makefile:
                cat1 += 8
            if "-Werror" in makefile and "-Wall" in makefile:
                cat1 += 5
            if "-sWASM=1" not in makefile and "-sUSE_PTHREADS=1" not in makefile:
                cat1 += 4
            score += min(cat1, 25)
            notes.append(f"Compilation Flags: {cat1}/25")

            # Category 2: Separate Compilation (25 pts)
            cat2 = 0
            if "-c " in makefile and ("%.o: %.cpp" in makefile or ".o" in makefile):
                cat2 += 15
            if "-flto" in makefile or "-O3" in makefile or "-Oz" in makefile:
                cat2 += 10
            score += min(cat2, 25)
            notes.append(f"Separate Compilation: {cat2}/25")

            # Category 3: JS & C++ Interop (Embind) (25 pts)
            cat3 = 0
            if "--bind" in makefile and "EMSCRIPTEN_BINDINGS" in cpp:
                cat3 += 25
            elif "extern " in cpp or "EXPORTED_FUNCTIONS" in makefile:
                cat3 += 5
            score += min(cat3, 25)
            notes.append(f"JS & C++ Interop: {cat3}/25")

            # Category 4: Modern Web Standards (25 pts)
            cat4 = 0
            if "type=\"module\"" in html or "import Module" in html:
                cat4 += 15
            if "module.mjs" in makefile or "module.mjs" in html:
                cat4 += 10
            score += min(cat4, 25)
            notes.append(f"Modern Web Standards: {cat4}/25")

            scores[mode] = score
            analysis_notes[mode] = "; ".join(notes)

        unguided_score = scores.get("unguided", 0)
        guided_score = scores.get("guided", 0)
        uplift = guided_score - unguided_score

        report_path = RESULTS_DIR / test / "evaluation_report.md"
        report_content = f"""# Evaluation Report: {test}

## Executive Summary
- **Unguided Score:** {unguided_score} / 100
- **Guided Score:** {guided_score} / 100
- **Uplift (+pp):** +{uplift} points

## Detailed Notes
### Unguided Run
- **Score:** {unguided_score}/100
- **Notes:** {analysis_notes.get('unguided', 'N/A')}

### Guided Run
- **Score:** {guided_score}/100
- **Notes:** {analysis_notes.get('guided', 'N/A')}
"""
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report_content, encoding="utf-8")
        print(f"Wrote evaluation report: {report_path}")

    generate_summary_metrics()


def generate_summary_metrics() -> None:
    """Generate or update summary_metrics.md from all existing evaluation reports."""
    tests = get_all_tests()
    summary_rows = []

    for test in tests:
        report_path = RESULTS_DIR / test / "evaluation_report.md"
        if not report_path.exists():
            continue

        lines = report_path.read_text(encoding="utf-8").splitlines()
        unguided_score = None
        guided_score = None

        for line in lines:
            if "Unguided Score:" in line:
                m = re.search(r"(\d+)\s*/\s*100", line)
                if m:
                    unguided_score = int(m.group(1))
            elif "Guided Score:" in line:
                m = re.search(r"(\d+)\s*/\s*100", line)
                if m:
                    guided_score = int(m.group(1))

        if unguided_score is not None and guided_score is not None:
            uplift = guided_score - unguided_score
            summary_rows.append((test, unguided_score, guided_score, uplift))

    if summary_rows:
        name_w = max(16, *(len(r[0]) for r in summary_rows))
        header = (
            f"| {'Test Case':<{name_w}} | {'Unguided Score':<14} | "
            f"{'Guided Score':<12} | {'Uplift (+pp)':<12} |"
        )
        divider = (
            f"| :{(name_w - 1)*'-'} | :{12*'-'}: | :{10*'-'}: | :{10*'-'}: |"
        )
        formatted_rows = [
            f"| {t:<{name_w}} | {u!s:^14} | {g!s:^12} | {f'+{up}':^12} |"
            for t, u, g, up in summary_rows
        ]
        summary_file = RESULTS_DIR / "summary_metrics.md"
        summary_md = (
            "# Emscripten Guidance AI Agent Evaluation Metrics\n\n"
            + header
            + "\n"
            + divider
            + "\n"
            + "\n".join(formatted_rows)
            + "\n"
        )
        summary_file.write_text(summary_md, encoding="utf-8")
        print(f"\nWrote summary metrics: {summary_file}")


def print_status() -> None:
    """Print status table of all test workspaces."""
    print("\n=== Emscripten Evaluation Harness Status ===")
    tests = get_all_tests()
    if not tests:
        print("No tests found.")
        return

    print(f"{'Test Case':<20} | {'Mode':<10} | {'Makefile':<10} | {'Build':<8} | {'Score':<8}")
    print("-" * 65)

    for test in tests:
        for mode in ["unguided", "guided"]:
            workspace = RESULTS_DIR / test / mode
            has_makefile = (workspace / "Makefile").exists()
            build_log = workspace / "build.log"
            build_status = "N/A"
            if build_log.exists():
                txt = build_log.read_text(encoding="utf-8")
                build_status = "FAIL" if "error:" in txt.lower() else "PASS"
            elif has_makefile and (workspace / "module.mjs").exists():
                build_status = "PASS"

            score = "N/A"
            report = RESULTS_DIR / test / "evaluation_report.md"
            if report.exists():
                lines = report.read_text(encoding="utf-8").splitlines()
                for line in lines:
                    if f"{mode.capitalize()} Score:" in line:
                        score = line.split("Score:")[1].split("/")[0].replace("*", "").strip() + "/100"
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

    # setup
    setup_p = subparsers.add_parser("setup", help="Set up test workspaces")
    setup_p.add_argument("--test", help="Specific test name (or all by default)")

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
        default="print",
        help="Runner engine to execute",
    )
    run_p.add_argument("--test", help="Specific test name")
    run_p.add_argument(
        "--async",
        dest="async_mode",
        action="store_true",
        help="Launch agent without waiting for completion",
    )
    run_p.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="Maximum seconds to wait for agent completion (default: 600)",
    )

    # build
    build_p = subparsers.add_parser(
        "build", help="Run make inside test workspaces"
    )
    build_p.add_argument("--test", help="Specific test name")

    # evaluate
    eval_p = subparsers.add_parser("evaluate", help="Evaluate and score outputs")
    eval_p.add_argument("--test", help="Specific test name")

    # summarize
    subparsers.add_parser(
        "summarize",
        help="Re-generate summary_metrics.md from all existing reports",
    )

    # all
    all_p = subparsers.add_parser(
        "all",
        help="Run full pipeline (setup -> run -> build -> evaluate)",
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
    all_p.add_argument("--test", help="Specific test name (or all by default)")
    all_p.add_argument(
        "--async",
        dest="async_mode",
        action="store_true",
        help="Launch agent without waiting for completion",
    )
    all_p.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="Maximum seconds to wait for agent completion (default: 600)",
    )

    # status
    subparsers.add_parser("status", help="Show status of test workspaces")

    args = parser.parse_args()

    tests = [args.test] if getattr(args, "test", None) else get_all_tests()

    if args.command == "setup":
        setup_tests(tests)
    elif args.command == "run":
        run_agent(
            tests,
            args.runner,
            async_mode=args.async_mode,
            timeout=args.timeout,
        )
    elif args.command == "build":
        build_workspaces(tests)
    elif args.command == "evaluate":
        evaluate_tests(tests)
    elif args.command == "summarize":
        generate_summary_metrics()
    elif args.command == "all":
        setup_tests(tests)
        run_agent(
            tests,
            args.runner,
            async_mode=args.async_mode,
            timeout=args.timeout,
        )
        if not args.async_mode:
            build_workspaces(tests)
            evaluate_tests(tests)
            print_status()
    elif args.command == "status":
        print_status()


if __name__ == "__main__":
    main()
