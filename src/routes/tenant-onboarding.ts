import { Router } from "express";
import { requireAuth } from "../middleware/auth";

export const tenantOnboardingRouter = Router();

tenantOnboardingRouter.get("/setup/page", requireAuth, (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tenant Setup Wizard | AI Centralize</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
            display: ["Sora", "Plus Jakarta Sans", "ui-sans-serif", "sans-serif"]
          },
          colors: {
            deep: "#13233f",
            mint: "#14a37f",
            skysoft: "#ebf4ff"
          },
          boxShadow: {
            panel: "0 30px 80px rgba(19, 35, 63, 0.12)",
            card: "0 16px 35px rgba(19, 35, 63, 0.10)"
          }
        }
      }
    };
  </script>
  <style>
    body {
      background:
        radial-gradient(70vw 50vh at -10% 20%, rgba(136, 219, 180, 0.36), transparent 65%),
        radial-gradient(60vw 40vh at 108% 18%, rgba(147, 191, 255, 0.30), transparent 65%),
        linear-gradient(180deg, #f9fcff 0%, #f4f9ff 42%, #eef6f8 100%);
    }
    .glass {
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(9px);
    }
    .coach-mark {
      position: fixed;
      background: rgba(19, 35, 63, 0.95);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.4;
      max-width: 280px;
      z-index: 1000;
      box-shadow: 0 10px 40px rgba(19, 35, 63, 0.3);
      pointer-events: none;
    }
    .coach-mark::after {
      content: '';
      position: absolute;
      width: 8px;
      height: 8px;
      background: rgba(19, 35, 63, 0.95);
      transform: rotate(45deg);
    }
    .step-indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-weight: 700;
      font-size: 14px;
    }
    .step-active {
      background: linear-gradient(to right, #3b82f6, #06b6d4);
      color: white;
    }
    .step-done {
      background: #10b981;
      color: white;
    }
    .step-todo {
      background: #e5e7eb;
      color: #9ca3af;
    }
  </style>
</head>
<body class="font-sans text-deep antialiased">
  <main class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
    <header class="glass rounded-2xl border border-white/70 px-6 py-4 shadow-card">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-semibold uppercase tracking-wide text-emerald-600">Setup Guide</p>
          <h1 class="font-display text-2xl font-extrabold">Tenant Setup Wizard</h1>
        </div>
        <div class="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 text-xl font-extrabold text-white">A</div>
      </div>
    </header>

    <div class="mt-8 grid gap-6 lg:grid-cols-4">
      <div class="hidden rounded-xl border border-slate-200 bg-white p-4 lg:block">
        <div class="space-y-3">
          <div class="step-indicator step-active" id="indicator-1">1</div>
          <p class="text-sm font-semibold text-slate-700">Create Tenant</p>

          <hr class="my-2" />

          <div class="step-indicator step-todo" id="indicator-2">2</div>
          <p class="text-sm font-semibold text-slate-600">Add Members</p>

          <hr class="my-2" />

          <div class="step-indicator step-todo" id="indicator-3">3</div>
          <p class="text-sm font-semibold text-slate-600">Create Project</p>

          <hr class="my-2" />

          <div class="step-indicator step-todo" id="indicator-4">4</div>
          <p class="text-sm font-semibold text-slate-600">Start Meeting</p>
        </div>
      </div>

      <div class="lg:col-span-3">
        <div id="step-1" class="glass rounded-2xl border border-white/80 p-6 shadow-panel">
          <div class="mb-6">
            <h2 class="font-display text-xl font-bold">Step 1: Create Your Tenant</h2>
            <p class="mt-2 text-sm text-slate-600">A tenant is your organization workspace where team members collaborate on meetings and decisions.</p>
          </div>

          <div class="space-y-4">
            <div>
              <label for="tenantName" class="mb-2 block text-sm font-semibold text-slate-700">Organization Name</label>
              <input id="tenantName" type="text" placeholder="e.g., Acme Corporation" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              <p class="mt-1 text-xs text-slate-500">Give your organization a clear, recognizable name</p>
            </div>

            <div>
              <label for="tenantSlug" class="mb-2 block text-sm font-semibold text-slate-700">Workspace Slug</label>
              <input id="tenantSlug" type="text" placeholder="e.g., acme-corp" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              <p class="mt-1 text-xs text-slate-500">URL-friendly identifier (lowercase, hyphens only)</p>
            </div>

            <div class="flex gap-2 pt-4">
              <button id="createTenantBtn" class="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Create Tenant</button>
              <button id="skipTenantBtn" class="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50">Use Existing</button>
            </div>

            <div id="step1Status" class="min-h-[1.2em] text-sm text-slate-600"></div>
          </div>
        </div>

        <div id="step-2" class="hidden glass rounded-2xl border border-white/80 p-6 shadow-panel">
          <div class="mb-6">
            <h2 class="font-display text-xl font-bold">Step 2: Add Team Members</h2>
            <p class="mt-2 text-sm text-slate-600">Invite colleagues to join your workspace with specific roles.</p>
          </div>

          <div class="space-y-4">
            <div>
              <label for="memberEmail" class="mb-2 block text-sm font-semibold text-slate-700">Team Member Email</label>
              <input id="memberEmail" type="email" placeholder="colleague@company.com" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>

            <div>
              <label for="memberRole" class="mb-2 block text-sm font-semibold text-slate-700">Role</label>
              <select id="memberRole" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="MANAGER">Manager (can add members)</option>
                <option value="MEMBER" selected>Member (can view & participate)</option>
                <option value="VIEWER">Viewer (read-only)</option>
              </select>
            </div>

            <div id="membersList" class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Members to add</p>
              <div id="membersListContent" class="mt-2 space-y-2 text-sm text-slate-600">
                <p class="italic">None yet. Add one above.</p>
              </div>
            </div>

            <div class="flex gap-2 pt-4">
              <button id="addMemberBtn" class="rounded-xl border border-blue-200 bg-white px-5 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50">+ Add Member</button>
              <button id="nextStep2Btn" class="rounded-xl bg-gradient-to-r from-green-600 to-green-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Next →</button>
            </div>

            <div id="step2Status" class="min-h-[1.2em] text-sm text-slate-600"></div>
          </div>
        </div>

        <div id="step-3" class="hidden glass rounded-2xl border border-white/80 p-6 shadow-panel">
          <div class="mb-6">
            <h2 class="font-display text-xl font-bold">Step 3: Create Your First Project</h2>
            <p class="mt-2 text-sm text-slate-600">Projects organize meetings, decisions, and action items by context.</p>
          </div>

          <div class="space-y-4">
            <div>
              <label for="projectCode" class="mb-2 block text-sm font-semibold text-slate-700">Project Code</label>
              <input id="projectCode" type="text" placeholder="e.g., PRJ-001" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              <p class="mt-1 text-xs text-slate-500">Unique identifier for quick reference</p>
            </div>

            <div>
              <label for="projectName" class="mb-2 block text-sm font-semibold text-slate-700">Project Name</label>
              <input id="projectName" type="text" placeholder="e.g., Q2 Product Launch" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>

            <div>
              <label for="projectDesc" class="mb-2 block text-sm font-semibold text-slate-700">Description (optional)</label>
              <textarea id="projectDesc" placeholder="What is this project about?" class="min-h-[100px] w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"></textarea>
            </div>

            <div class="flex gap-2 pt-4">
              <button id="createProjectBtn" class="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Create Project</button>
              <button id="nextStep3Btn" class="rounded-xl bg-gradient-to-r from-green-600 to-green-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Finish →</button>
            </div>

            <div id="step3Status" class="min-h-[1.2em] text-sm text-slate-600"></div>
          </div>
        </div>

        <div id="step-4" class="hidden glass rounded-2xl border border-white/80 p-6 shadow-panel">
          <div class="mb-6">
            <h2 class="font-display text-xl font-bold">✓ Setup Complete!</h2>
            <p class="mt-2 text-sm text-slate-600">Your tenant is ready. Now add meetings to start capturing decisions and action items.</p>
          </div>

          <div class="space-y-4">
            <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p class="text-sm font-semibold text-emerald-800">Next steps:</p>
              <ul class="mt-2 space-y-2 text-sm text-emerald-700">
                <li>✓ Create meetings in your project</li>
                <li>✓ Upload transcripts or paste notes</li>
                <li>✓ Review and approve minutes</li>
                <li>✓ Track action items and decisions</li>
              </ul>
            </div>

            <div class="flex gap-2 pt-4">
              <a href="/continuity/dashboard/page" class="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02] inline-block">Go to Dashboard →</a>
              <a href="/" class="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 inline-block">Back to Home</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    let token = localStorage.getItem('aicentralize_token');
    let currentTenantId = null;
    let membersToAdd = [];
    let currentStep = 1;

    function getAuthHeaders() {
      return {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${token}\`
      };
    }

    function setStatus(elementId, text, isError = false) {
      const el = document.getElementById(elementId);
      if (el) {
        el.textContent = text;
        el.className = \`min-h-[1.2em] text-sm \${isError ? 'text-rose-600' : 'text-emerald-600'}\`;
      }
    }

    function moveToStep(step) {
      document.querySelectorAll('[id^="step-"]').forEach(el => {
        el.classList.add('hidden');
      });
      document.getElementById(\`step-\${step}\`).classList.remove('hidden');

      ['1','2','3','4'].forEach(s => {
        const ind = document.getElementById(\`indicator-\${s}\`);
        if (ind) {
          ind.className = 'step-indicator';
          if (parseInt(s) < step) ind.classList.add('step-done');
          else if (parseInt(s) === step) ind.classList.add('step-active');
          else ind.classList.add('step-todo');
        }
      });

      currentStep = step;
    }

    document.getElementById('createTenantBtn').addEventListener('click', async () => {
      const name = document.getElementById('tenantName').value.trim();
      const slug = document.getElementById('tenantSlug').value.trim();

      if (!name || !slug) {
        setStatus('step1Status', 'Please fill in all fields', true);
        return;
      }

      try {
        const res = await fetch('/tenants', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name, slug })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to create tenant');
        }

        const tenant = await res.json();
        currentTenantId = tenant.id;
        setStatus('step1Status', \`✓ Tenant "\${name}" created\`);
        setTimeout(() => moveToStep(2), 800);
      } catch (error) {
        setStatus('step1Status', error.message, true);
      }
    });

    document.getElementById('addMemberBtn').addEventListener('click', () => {
      const email = document.getElementById('memberEmail').value.trim();
      const role = document.getElementById('memberRole').value;

      if (!email) {
        alert('Please enter an email');
        return;
      }

      membersToAdd.push({ email, role });
      document.getElementById('memberEmail').value = '';

      const list = document.getElementById('membersListContent');
      list.innerHTML = membersToAdd.map((m, i) => \`
        <div class="flex justify-between items-center p-2 bg-white rounded-lg">
          <div>
            <p class="font-medium text-slate-700">\${m.email}</p>
            <p class="text-xs text-slate-500">\${m.role}</p>
          </div>
          <button onclick="membersToAdd.splice(\${i}, 1); document.getElementById('addMemberBtn').click();" class="text-xs text-rose-600 hover:text-rose-700">Remove</button>
        </div>
      \`).join('');
    });

    document.getElementById('nextStep2Btn').addEventListener('click', () => {
      moveToStep(3);
    });

    document.getElementById('createProjectBtn').addEventListener('click', async () => {
      const code = document.getElementById('projectCode').value.trim();
      const name = document.getElementById('projectName').value.trim();
      const description = document.getElementById('projectDesc').value.trim();

      if (!code || !name) {
        setStatus('step3Status', 'Please fill in code and name', true);
        return;
      }

      if (!currentTenantId) {
        setStatus('step3Status', 'Tenant ID missing', true);
        return;
      }

      try {
        const res = await fetch('/projects', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ code, name, description, tenantId: currentTenantId })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to create project');
        }

        setStatus('step3Status', \`✓ Project "\${name}" created\`);
        setTimeout(() => moveToStep(4), 800);
      } catch (error) {
        setStatus('step3Status', error.message, true);
      }
    });

    document.getElementById('nextStep3Btn').addEventListener('click', () => {
      moveToStep(4);
    });

    document.getElementById('skipTenantBtn').addEventListener('click', () => {
      // Load existing tenants
      moveToStep(3);
    });

    if (!token) {
      window.location.href = '/auth/login?next=/tenants/setup/page';
    }

    moveToStep(1);
  </script>
</body>
</html>`);
});
