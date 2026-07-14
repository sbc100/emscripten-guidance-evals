#!/usr/bin/env python3
"""Automated evaluation harness for benchmarking AI coding agents on Emscripten.

This script sets up isolated git repositories for each evaluation test case,
runs agents with and without access to Emscripten guidance (best practices),
verifies build outcomes, and evaluates the generated solutions.
"""

import argparse
import shutil
import subprocess
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


def run_agent(tests: list[str], runner: str) -> None:
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
                cmd = [
                    "agentapi",
                    "new-conversation",
                    f"--title={test} ({mode})",
                    prompt_content,
                ]
                print(f"Executing: {' '.join(cmd[:3])} '<prompt>' in {workspace}")
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
    summary_rows = []

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

        summary_rows.append(f"| {test} | {unguided_score} | {guided_score} | +{uplift} |")

    if summary_rows:
        summary_file = RESULTS_DIR / "summary_metrics.md"
        summary_md = (
            "# Emscripten Guidance AI Agent Evaluation Metrics\n\n"
            "| Test Case | Unguided Score | Guided Score | Uplift (+pp) |\n"
            "| :--- | :---: | :---: | :---: |\n"
            + "\n".join(summary_rows)
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
        choices=["print", "agentapi", "gemini", "claude", "mock"],
        default="print",
        help="Runner engine to execute",
    )
    run_p.add_argument("--test", help="Specific test name")

    # build
    build_p = subparsers.add_parser(
        "build", help="Run make inside test workspaces"
    )
    build_p.add_argument("--test", help="Specific test name")

    # evaluate
    eval_p = subparsers.add_parser("evaluate", help="Evaluate and score outputs")
    eval_p.add_argument("--test", help="Specific test name")

    # status
    subparsers.add_parser("status", help="Show status of test workspaces")

    args = parser.parse_args()

    tests = [args.test] if getattr(args, "test", None) else get_all_tests()

    if args.command == "setup":
        setup_tests(tests)
    elif args.command == "run":
        run_agent(tests, args.runner)
    elif args.command == "build":
        build_workspaces(tests)
    elif args.command == "evaluate":
        evaluate_tests(tests)
    elif args.command == "status":
        print_status()


if __name__ == "__main__":
    main()
