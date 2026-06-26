import os
import sys
import subprocess
import time
import shutil

def log(msg):
    print(f"[KINESCOPE RUNNER] {msg}")

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Parse command-line args
    dev_mode = "--dev" in sys.argv
    
    # 2. Virtual Environment Configuration
    venv_dir = os.path.join(root_dir, ".venv")
    if sys.platform == "win32":
        python_exe = os.path.join(venv_dir, "Scripts", "python.exe")
        pip_exe = os.path.join(venv_dir, "Scripts", "pip.exe")
    else:
        python_exe = os.path.join(venv_dir, "bin", "python")
        pip_exe = os.path.join(venv_dir, "bin", "pip")

    # Create venv if missing
    if not os.path.exists(venv_dir):
        log("Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)
        log("Virtual environment created.")

    # 3. Install Python Dependencies
    log("Verifying Python dependencies...")
    reqs_path = os.path.join(root_dir, "backend", "requirements.txt")
    subprocess.run([pip_exe, "install", "-r", reqs_path], check=True)
    log("Python dependencies up to date.")

    # 4. Handle React Frontend Build
    frontend_dir = os.path.join(root_dir, "frontend")
    dist_dir = os.path.join(frontend_dir, "dist")
    
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    
    if dev_mode:
        log("Starting in DEV mode...")
        # Check node_modules
        node_modules = os.path.join(frontend_dir, "node_modules")
        if not os.path.exists(node_modules):
            log("Installing Node dependencies...")
            subprocess.run(f"{npm_cmd} install", cwd=frontend_dir, shell=True, check=True)
        
        # Start Vite dev server as background process
        log("Launching Vite dev server...")
        vite_proc = subprocess.Popen(
            f"{npm_cmd} run dev", 
            cwd=frontend_dir, 
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        
        # Give Vite a moment to start
        time.sleep(1.5)
        
        # Run Python backend in dev mode
        env = os.environ.copy()
        env["KINESCOPE_DEV"] = "1"
        try:
            log("Starting backend window...")
            subprocess.run([python_exe, os.path.join(root_dir, "backend", "main.py")], env=env)
        finally:
            log("Stopping Vite dev server...")
            vite_proc.terminate()
            vite_proc.wait()
            
    else:
        # Production run: Ensure frontend is built
        if not os.path.exists(os.path.join(dist_dir, "index.html")):
            log("Frontend build not found. Compiling React files...")
            
            # Install Node modules if needed
            node_modules = os.path.join(frontend_dir, "node_modules")
            if not os.path.exists(node_modules):
                log("Installing Node dependencies...")
                subprocess.run(f"{npm_cmd} install", cwd=frontend_dir, shell=True, check=True)
                
            # Build React app
            log("Compiling static assets...")
            subprocess.run(f"{npm_cmd} run build", cwd=frontend_dir, shell=True, check=True)
            log("Frontend assets built successfully.")
            
        # Launch Python backend in production mode pointing to built index.html
        log("Launching Kinescope deck...")
        subprocess.run([python_exe, os.path.join(root_dir, "backend", "main.py")])

if __name__ == "__main__":
    main()
