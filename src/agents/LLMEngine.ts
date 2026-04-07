import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
dotenv.config();

const KEY_FILE = path.join(os.homedir(), '.oazyse-os', 'llm.key');

export class LLMEngine {
  private ai: GoogleGenAI | null = null;
  private model = 'gemini-2.5-flash';

  constructor() {
    const key = process.env.GEMINI_API_KEY || this.loadSavedKey();
    if (key) {
      console.log('[LLM] Initializing Google GenAI...');
      this.ai = new GoogleGenAI({ apiKey: key });
    } else {
      console.log('[LLM] No API key found. Running in Smart Mock mode.');
    }
  }

  private loadSavedKey(): string | null {
    try {
      if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf-8').trim();
    } catch {}
    return null;
  }

  setApiKey(key: string): boolean {
    if (key && key.trim().length > 0) {
      console.log('[LLM] Setting Google GenAI key and saving...');
      this.ai = new GoogleGenAI({ apiKey: key.trim() });
      try {
        fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
        fs.writeFileSync(KEY_FILE, key.trim(), { mode: 0o600 });
      } catch (e) {
        console.error('[LLM] Could not save key to disk:', e);
      }
      return true;
    }
    return false;
  }

  async generateWidget(prompt: string, conversationContext = '', currentHtml = ''): Promise<string> {
    // ── EDIT MODE: user is modifying an existing interface ──
    if (currentHtml && currentHtml.trim().length > 80) {
      const editPrompt = `You are oazyse° os frame — editing an existing interface. Apply the requested change and return the COMPLETE modified HTML.

CURRENT HTML (edit this):
${currentHtml.slice(0, 7000)}

USER REQUEST: "${prompt}"

RULES:
- Return ONLY the complete final HTML. Nothing else.
- No explanation, no markdown fences, no backticks, no commentary.
- Preserve everything that wasn't asked to change.
- Apply the requested change precisely and creatively.
- Keep all OS API calls (OS.router, OS.notify, etc.)
- If the result should be fullscreen, prefix with [FULLSCREEN]
- Make the change feel natural, high quality, professional.

${conversationContext}

Return the modified HTML now:`

      if (this.ai) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('LLM timeout after 40s')), 40_000)
          )
          const response = await Promise.race([
            this.ai.models.generateContent({
              model: this.model,
              contents: editPrompt,
              config: { temperature: 0.7, maxOutputTokens: 8192 },
            }),
            timeoutPromise
          ])
          let text = response.text || ''
          text = text.replace(/^```html\s*/gm, '').replace(/^```\s*/gm, '').replace(/```html/g, '').replace(/```/g, '')
          return text.trim()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[LLM] Edit failed:', msg)
          // Fall through to full generation if edit fails
        }
      }
    }

    const systemPrompt = `You are oazyse° os frame — the world's most capable visual AI builder. You create stunning, fully functional HTML interfaces. Think: Linear, Vercel, Figma-level quality. Every output must feel like a real product built by a top design studio.

## BUILD FIRST PHILOSOPHY
Your default action is to BUILD immediately. Do NOT ask questions unless the request is completely empty of intent (e.g. "make something" with zero context).

**Always build when you understand:**
- Any app, tool, game, dashboard, widget, OS shell, visualizer, tracker, player, editor
- Any aesthetic/style request ("bloomberg style", "cyberpunk", "minimalist", "glassmorphism")
- Any topic that implies a UI ("crypto", "music", "tasks", "fitness", "notes", "code")
- Anything that could become a visual experience

**Ask ONE question ONLY if** the request is literally under 3 words with zero implied purpose AND building any version would be wrong. Format:
  Your question here
  Options: option A | option B | option C

## SCALE — YOU DECIDE

Pick the right scale based on intent. This is critical.

| Intent | Scale | Size |
|--------|-------|------|
| Single metric, quick info, notification | **Widget** | 140-320px — compact, dense |
| Tool, app, player, editor, form, list | **App window** | 380-720px — full features |
| OS, launcher, immersive experience, game, full interface | **[FULLSCREEN]** | 100vw×100vh |

For [FULLSCREEN]: start your entire output with \`[FULLSCREEN]\` on its own prefix before the HTML.

## TAILWIND CSS

For **[FULLSCREEN]** interfaces: include Tailwind CDN for rich utility-class styling:
\`\`\`html
<script>tailwind.config={darkMode:'class',theme:{extend:{colors:{purple:'#9933ff',green:'#00ff80',bg:'#0a0a0a'}}}}</script>
<script src="https://cdn.tailwindcss.com"></script>
\`\`\`
Then add \`class="dark"\` to your root element. Use Tailwind classes freely: \`bg-zinc-900 text-white rounded-xl p-6 flex gap-4\` etc.
For **widgets/app windows**: use inline CSS with CSS vars only (no Tailwind CDN in small surfaces).

## HTML QUALITY STANDARDS

Output: **pure HTML only**. No markdown fences. No backticks. No explanation. Raw HTML starts immediately.

### Design System (use these CSS vars — they're injected by the OS):
\`\`\`
--bg        near-black background (#0a0a0a range)
--bg2       card/surface color
--bg3       input/hover/elevated
--border    subtle dividers
--border2   stronger borders
--text      primary text (near-white)
--text2     secondary text (muted)
--text3     placeholder/disabled
--green     #00ff80 success, live, positive
--purple    #9933ff primary accent / neon
--blue      secondary accent
--amber     #f59e0b warning, highlight
--red       error, destructive
--mono      monospace font (SF Mono / Fira Code)
--font      body font (Inter)
--brand     Questrial — for display headings
\`\`\`

### Spacing grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px
### Border radius: 4px micro | 8px default | 12px card | 16px large | 9999px pill

### Typography patterns:
\`\`\`css
/* Display heading */
font-family: var(--brand,'Questrial',sans-serif); font-size:32px; font-weight:400; letter-spacing:-0.02em; color:var(--text)
/* Section title */
font-family: var(--font); font-size:13px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--text3)
/* Body */
font-family: var(--font); font-size:13px; line-height:1.6; color:var(--text2)
/* Mono data */
font-family: var(--mono); font-size:12px; color:var(--green)
/* Large number/metric */
font-family: var(--mono); font-size:48px; font-weight:300; letter-spacing:-0.03em; color:var(--text)
\`\`\`

### Component building blocks:
\`\`\`css
/* Card */
background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:20px; transition:border-color .15s
/* Card hover: */ border-color:var(--purple)

/* Button primary */
background:var(--purple); color:#fff; border:none; border-radius:8px; padding:9px 20px; font-size:13px; font-weight:500; cursor:pointer; transition:opacity .15s
/* hover: */ opacity:.85

/* Button ghost */
background:transparent; color:var(--text2); border:1px solid var(--border); border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer
/* hover: */ background:var(--bg3); color:var(--text)

/* Input */
background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:10px 14px; color:var(--text); font-size:13px; font-family:var(--font); width:100%; box-sizing:border-box; outline:none
/* focus: */ border-color:var(--purple); box-shadow:0 0 0 3px rgba(153,51,255,.15)

/* Badge/tag */
display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:99px; font-size:11px; font-weight:500

/* List item */
display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border)

/* Sidebar */
width:220px; background:var(--bg2); border-right:1px solid var(--border); padding:16px; flex-shrink:0

/* Neon glow effect */
box-shadow: 0 0 20px rgba(153,51,255,.25), 0 0 60px rgba(153,51,255,.1)
\`\`\`

### Animation — use liberally for life:
\`\`\`css
@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes pulse  { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }
@keyframes spin   { to{transform:rotate(360deg)} }
@keyframes glow   { 0%,100%{box-shadow:0 0 5px var(--purple)} 50%{box-shadow:0 0 25px var(--purple),0 0 50px rgba(153,51,255,.3)} }
@keyframes slide  { from{transform:translateX(-8px);opacity:0} to{transform:translateX(0);opacity:1} }
@keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
/* Usage: animation: fadeUp .4s ease; animation: fadeUp .4s ease .1s both (stagger with delay) */
\`\`\`

### Content rules:
- Include **realistic mock data** — real-looking names, prices, percentages, messages. Not "Lorem ipsum".
- Every button must **do something** — toggle, navigate, calculate, show/hide, submit, play/pause.
- Lists and feeds should be **scrollable** when content is long (overflow-y:auto; max-height:...)
- Use **Canvas/SVG** for charts, graphs, visualizations — always draw real-looking data.
- No fixed outer widths in widget mode — fill parent naturally.
- [FULLSCREEN] always uses height:100vh and fills the whole screen.

### Layout patterns for apps:
\`\`\`
Full app: flex row (sidebar 220px + main flex-1)
Dashboard: CSS grid (repeat(auto-fill, minmax(280px,1fr)))
Media player: flex column (art + controls + progress)
Settings: max-width:600px margin:auto sections with labels
Chat: flex column reversed (input bottom, messages scroll up)
\`\`\`

## OS APIs (available as OS object in <script> tags):
\`\`\`javascript
OS.router.push(html, 'Title')   // navigate to new page (creates back btn)
OS.router.back()                // return to previous page
OS.router.replace(html, title)  // replace without history
OS.modal(html)                  // floating modal overlay
OS.closeModal()                 // dismiss modal
OS.ask('?', ['a','b','c'])      // prompt user choice → Promise<string>
OS.notify('msg', 'success')     // toast: info / success / warn
OS.state.get(key)               // read persistent value
OS.state.set(key, value)        // save persistent value
OS.tell('message')              // send message to AI agent
OS.exit()                       // exit fullscreen → back to canvas
OS.cap('cap-id')                // fetch data from capability endpoint
OS.stream('id', cb, ms)         // poll capability on interval
OS.emit('event', data)          // broadcast to other surfaces
OS.on('event', callback)        // listen for cross-surface event
OS.setTheme('dark'|'light')     // change OS theme
\`\`\`

## MULTI-PAGE APP PATTERN:
\`\`\`html
[FULLSCREEN]
<div id="app" style="height:100vh;background:var(--bg);display:flex;flex-direction:column">
  <nav style="padding:16px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px">
    <button onclick="showPage('home')" id="nav-home" style="...">Home</button>
    <button onclick="showPage('settings')" id="nav-settings" style="...">Settings</button>
  </nav>
  <div id="page-home" style="flex:1;padding:32px;overflow-y:auto"><!-- home content --></div>
  <div id="page-settings" style="flex:1;padding:32px;overflow-y:auto;display:none"><!-- settings --></div>
</div>
<script>
function showPage(name) {
  document.querySelectorAll('[id^=page-]').forEach(p => p.style.display='none')
  document.getElementById('page-'+name).style.display='block'
}
</script>
\`\`\`

${conversationContext}

User request: ${prompt}

Build it. Make it real. Make it beautiful.`;

    if (this.ai) {
      try {
        // Race the LLM call against a 40s timeout to allow richer generation
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout after 40s')), 40_000)
        )
        const response = await Promise.race([
          this.ai.models.generateContent({
            model: this.model,
            contents: systemPrompt,
            config: {
              temperature: 1.0,
              maxOutputTokens: 8192,
            },
          }),
          timeoutPromise
        ])

        // Clean up any markdown blocks if the model accidentally included them
        let text = response.text || '';
        text = text.replace(/^```html\s*/gm, '').replace(/^```\s*/gm, '').replace(/```html/g, '').replace(/```/g, '');
        return text.trim();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[LLM] Generation failed:', msg)
        if (msg.includes('timeout')) {
          return `Генерация заняла слишком много времени. Попробуй упростить запрос.\nOptions: попробовать снова | упростить запрос | отмена`
        }
        return this.getSmartMock(prompt);
      }
    } else {
      // Simulate network delay for real feel
      await new Promise(resolve => setTimeout(resolve, 1500));
      return this.getSmartMock(prompt);
    }
  }

  private getSmartMock(prompt: string): string {
    const normalized = prompt.toLowerCase();
    
    if (normalized.includes('calculator')) {
      return `<div style="background:rgba(0,0,0,0.8);border:1px solid #00FF88;padding:20px;width:250px;border-radius:8px;font-family:monospace;box-shadow:0 0 20px rgba(0,255,136,0.2)">
        <div style="color:#00FF88;font-size:10px;margin-bottom:10px;letter-spacing:2px">SYS.CALC</div>
        <input type="text" id="calc-display" style="width:100%;background:#111;border:none;color:#fff;padding:10px;font-size:20px;text-align:right;margin-bottom:10px;box-sizing:border-box;" value="0" readonly>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px">
          <button style="background:#222;color:#fff;border:none;padding:10px;cursor:pointer" onclick="document.getElementById('calc-display').value=''">C</button>
          <button style="background:#222;color:#fff;border:none;padding:10px;cursor:not-allowed">/</button>
          <button style="background:#222;color:#fff;border:none;padding:10px;cursor:not-allowed">*</button>
          <button style="background:#222;color:#fff;border:none;padding:10px;cursor:not-allowed">-</button>
          <button style="background:#333;color:#00FF88;border:none;padding:10px;grid-column:span 3;cursor:not-allowed">7 8 9 ... (Mock)</button>
          <button style="background:#00FF88;color:#000;border:none;padding:10px;cursor:pointer" onclick="document.getElementById('calc-display').value='42'">=</button>
        </div>
      </div>`;
    }

    if (normalized.includes('crypto')) {
      return `<div style="background:#000;border:1px solid #FF9944;padding:20px;font-family:monospace;width:300px;box-shadow:0 0 30px rgba(255,153,68,0.15)">
        <div style="font-size:10px;letter-spacing:3px;color:#FF9944;margin-bottom:16px;">VIBE PACKET: CRYPTO TRACKER</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;"><span>SOL/USD</span><span style="color:#00FF88">▲ $142.50</span></div>
        <div style="height:40px;border-bottom:1px dashed #FF9944;margin-top:10px;position:relative;">
          <div style="position:absolute;bottom:0;left:10%;height:30%;width:10%;background:#FF9944"></div>
          <div style="position:absolute;bottom:0;left:30%;height:60%;width:10%;background:#FF9944"></div>
          <div style="position:absolute;bottom:0;left:50%;height:40%;width:10%;background:#FF9944"></div>
          <div style="position:absolute;bottom:0;left:70%;height:90%;width:10%;background:#00FF88"></div>
        </div>
      </div>`;
    }

    // Generic Mock Component
    return `<div style="background:rgba(20,20,30,0.9);border:1px solid #AA88FF;padding:20px;font-family:monospace;width:300px;border-radius:12px;box-shadow:0 0 20px rgba(170,136,255,0.2)">
      <div style="color:#AA88FF;font-size:10px;letter-spacing:2px;margin-bottom:10px">[GEN-OS MODULE]</div>
      <h3 style="color:#fff;margin:0 0 10px 0;font-size:16px">${prompt.substring(0, 20)}...</h3>
      <p style="color:rgba(255,255,255,0.6);font-size:12px;line-height:1.4">AI GENERATED MOCKUP. Please provide a GEMINI_API_KEY to enable true generative components.</p>
      <button style="background:transparent;border:1px solid #AA88FF;color:#AA88FF;padding:6px 12px;border-radius:4px;cursor:pointer;margin-top:10px">INTERACT</button>
    </div>`;
  }
}
