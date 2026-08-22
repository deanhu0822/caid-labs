# Local OpenCAD integration

Forma owns engineering intent, requirements, dependencies, validation, and revisions. OpenCAD is a local physical-realization tool: it rebuilds geometry requested by Forma and returns a mesh plus real CAD exports. Its feature tree is not a second product-state database.

The integration was checked against `caid-technologies/OpenCAD` version 0.2.3 at commit `034820acfa9049832bb69490481200348f902ee2`. It uses the repository's documented aggregate FastAPI server and OCCT kernel contracts:

- `GET /kernel/healthz` and `GET /tree/healthz`
- `POST /tree/trees`, `POST /tree/trees/{tree}/nodes/{node}/typed-parameters`, and `POST /tree/trees/{tree}/rebuild`
- `GET /kernel/shapes/{shape}/mesh`
- `GET /kernel/files/{shape}/export?format=step|stl`

The official viewport package currently declares React 18 and React Three Fiber 8 peer dependencies, while Forma runs React 19. Forma therefore renders OpenCAD's real mesh contract with a small Three.js viewer instead of forcing an incompatible second React renderer into the app. Geometry creation, feature-tree mutation, rebuilding, meshing, and exports still come from OpenCAD and OCCT.

## Start OpenCAD locally

Clone OpenCAD next to the Forma checkout, create its Python environment, and install the official packages:

```powershell
git clone https://github.com/caid-technologies/OpenCAD.git
cd OpenCAD
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e '.\packages\opencad[occt]' -e '.\packages\opencad-agent[llm]' -e '.\apps\backend'
```

Run the aggregate server with the real OCCT backend and live feature-tree rebuilds:

```powershell
$env:OPENCAD_KERNEL_BACKEND = 'occt'
$env:OPENCAD_TREE_LIVE_KERNEL = 'true'
$env:OPENCAD_AGENT_LIVE_KERNEL = 'true'
$env:OPENCAD_KERNEL_URL = 'http://127.0.0.1:8000'
.\.venv\Scripts\python.exe -m uvicorn opencad_server.app:app --host 127.0.0.1 --port 8000
```

Then start Forma normally. `OPENCAD_URL` defaults to `http://127.0.0.1:8000`; it can be overridden server-side. The browser never calls OpenCAD directly.

## Runtime behavior

`POST /api/opencad/realize` creates a camera-mount feature tree, rebuilds the current model, updates the requested typed height parameter, rebuilds the proposed model, fetches both OpenCAD meshes, verifies the returned mesh height, and combines kernel checks with Forma's chassis and cable-clearance rules. A valid result can be applied to the shared reducer state and Rev D. STEP/STL links appear only for a successful OCCT operation.

If the service is missing, the modal says **OpenCAD unavailable** and does not claim that CAD ran. A user may explicitly load a **Simulated geometry preview** for presentation use; that state is labeled simulated throughout the UI, has no STEP/STL outputs, and remains distinguishable in Guided, Pro, and the feature realization record.

The focused live realization is currently mapped to the canonical camera-mount height workflow. Other pre-existing proposals can retain honest CAD follow-up notes without opening the camera-mount editor for the wrong artifact. The geometry demo is separate from the existing payload demo, and engineering changes that do not require geometry never open OpenCAD.
