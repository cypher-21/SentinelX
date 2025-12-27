"""SentinelX entry point."""
import os


def main():
    """Start SentinelX dashboard server."""
    from sentinelx.server import app
    
    debug_mode = os.environ.get('SENTINELX_DEBUG', '').lower() == 'true'
    app.run(host='127.0.0.1', port=5000, debug=debug_mode, threaded=True)


if __name__ == "__main__":
    main()
