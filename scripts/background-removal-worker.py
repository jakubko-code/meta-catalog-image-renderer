import json
import os
import resource
import sys

import onnxruntime as ort
from rembg import remove
from rembg.sessions import sessions


def create_memory_safe_session(model: str):
    session_class = sessions.get(model)
    if session_class is None:
        raise ValueError(f"Unknown background-removal model: {model}")

    options = ort.SessionOptions()
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.inter_op_num_threads = 1
    options.intra_op_num_threads = max(1, int(os.getenv("REMBG_CPU_THREADS", "2")))
    return session_class(model, options, providers=["CPUExecutionProvider"])


def restart_process() -> None:
    os.execv(sys.executable, [sys.executable, "-u", os.path.abspath(__file__)])


def peak_memory_mb() -> int:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024 * 1024 if sys.platform == "darwin" else 1024
    return round(peak / divisor)


def main() -> None:
    for line in sys.stdin:
        request = json.loads(line)
        request_id = request["id"]
        try:
            model = request["model"]
            session = create_memory_safe_session(model)
            with open(request["input"], "rb") as source:
                result = remove(source.read(), session=session)
            with open(request["output"], "wb") as target:
                target.write(result)
            response = {"id": request_id, "ok": True, "peakMemoryMb": peak_memory_mb()}
        except Exception as error:  # Worker must report a product-level failure and stay alive.
            response = {"id": request_id, "ok": False, "error": str(error)}
        print(json.dumps(response), flush=True)
        restart_process()


if __name__ == "__main__":
    main()
