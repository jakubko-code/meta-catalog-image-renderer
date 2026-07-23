import sys
from pathlib import Path

from rembg import new_session, remove


def main() -> None:
    if len(sys.argv) not in (3, 4, 5):
        raise SystemExit("Usage: remove-background-u2net.py INPUT OUTPUT [MODEL] [alpha-matting]")
    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    model = sys.argv[3] if len(sys.argv) >= 4 else "u2net"
    alpha_matting = len(sys.argv) == 5 and sys.argv[4] == "alpha-matting"
    session = new_session(model)
    output_path.write_bytes(remove(
        source_path.read_bytes(),
        session=session,
        alpha_matting=alpha_matting,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
    ))


if __name__ == "__main__":
    main()
