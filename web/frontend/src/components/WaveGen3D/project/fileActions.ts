// 檔案功能：新增 / 開啟 / 儲存 / 另存新檔 / 重新命名。
// 支援 File System Access API 的瀏覽器（Chrome、Edge）可以直接覆寫原本的 .rc 檔；其他瀏覽器改用下載。
import { encodeRc, decodeRc, RcError } from './rcFormat.js';
import { collectDoc, applyDoc } from './projectDoc.js';
import { useProject, withoutTracking } from './projectStore.js';
import { useWaveLab } from '../waveStore.js';
import { usePsuLab } from '../psuStore.js';
import { useSa, SA_DEFAULT } from '../saStore.js';
import { useDm, DM_DEFAULT } from '../dmStore.js';
import { useBoard } from '../boardStore.js';
import { useDev } from '../devboards/devStore.js';
import { DEV_KINDS, DEV_BOARDS, type DevKind } from '../devboards/boardDefs.js';
import { useFpga, exampleConf } from '../devboards/fpga/fpgaStore.js';
import { useChips } from '../chips/chipStore.js';
import type { DevConf } from '../devboards/devStore.js';

const PICKER_TYPES = [{ description: 'RealCad Lab 專案', accept: { 'application/x-realcad-lab': ['.rc'] } }];

// 開頁面時的初始設定（「新增專案」用）
const INITIAL = {
  gen: useWaveLab.getState().gen,
  scope: useWaveLab.getState().scope,
  psu: usePsuLab.getState().psu,
  loadIdx: usePsuLab.getState().loadIdx,
};

type PickerWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
};
const win = () => window as PickerWindow;

const baseName = (n: string) => n.replace(/\.rc$/i, '');
const confirmDiscard = () => !useProject.getState().dirty || confirm('目前的專案有未儲存的變更，確定要放棄嗎？');

export function newProject() {
  if (!confirmDiscard()) return;
  withoutTracking(() => {
    const w = useWaveLab.getState();
    w.setGen(INITIAL.gen);
    w.setWaveform(INITIAL.gen.waveform);
    w.setScope(INITIAL.scope);
    useSa.setState({ sa: SA_DEFAULT });
    useDm.setState({ dm: DM_DEFAULT });
    const p = usePsuLab.getState();
    p.setPsu(INITIAL.psu);
    p.setLoadIdx(INITIAL.loadIdx);
    p.replaceResistor();
    useBoard.getState().clearBoard();
    useChips.setState({ rt: {}, tab: null });
    useDev.getState().loadConf(Object.fromEntries(DEV_KINDS.map((k) => [k, { present: false, usb: true, code: DEV_BOARDS[k].example }])) as Record<DevKind, DevConf>);
    useFpga.getState().loadConf(exampleConf());
  });
  useProject.setState({ name: '未命名專案', handle: null, dirty: false, undo: [], redo: [] });
  useProject.getState().setToast('已建立新專案');
}

async function loadBytes(bytes: Uint8Array, fileName: string, handle: FileSystemFileHandle | null) {
  try {
    const doc = await decodeRc(bytes);
    let name = '';
    withoutTracking(() => { name = applyDoc(doc); });
    useProject.setState({ name: name || baseName(fileName), handle, dirty: false, undo: [], redo: [] });
    useProject.getState().setToast(`已開啟「${fileName}」`);
  } catch (err) {
    const msg = err instanceof RcError || err instanceof Error ? err.message : String(err);
    useProject.getState().setToast(`無法開啟：${msg}`, 'err');
  }
}

export async function openProject() {
  if (!confirmDiscard()) return;
  const w = win();
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: PICKER_TYPES, excludeAcceptAllOption: true, multiple: false });
      const f = await h.getFile();
      await loadBytes(new Uint8Array(await f.arrayBuffer()), f.name, h);
    } catch (err) { if ((err as Error).name !== 'AbortError') useProject.getState().setToast(`無法開啟：${(err as Error).message}`, 'err'); }
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.rc';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (f) await loadBytes(new Uint8Array(await f.arrayBuffer()), f.name, null);
  };
  input.click();
}

/** 拖放 .rc 檔到頁面上開啟 */
export async function openDroppedFile(f: File) {
  if (!/\.rc$/i.test(f.name)) { useProject.getState().setToast('只能開啟 .rc 專案檔', 'err'); return; }
  if (!confirmDiscard()) return;
  await loadBytes(new Uint8Array(await f.arrayBuffer()), f.name, null);
}

async function writeTo(handle: FileSystemFileHandle, bytes: Uint8Array) {
  const w = await handle.createWritable();
  await w.write(bytes as BufferSource);
  await w.close();
}

function download(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function saveProject(forceAs = false) {
  const st = useProject.getState();
  try {
    const bytes = await encodeRc(collectDoc(st.name));
    const w = win();
    if (st.handle && !forceAs) {
      await writeTo(st.handle, bytes);
      useProject.setState({ dirty: false });
      st.setToast(`已儲存「${st.handle.name}」`);
      return;
    }
    if (w.showSaveFilePicker) {
      try {
        const h = await w.showSaveFilePicker({ suggestedName: `${baseName(st.name)}.rc`, types: PICKER_TYPES, excludeAcceptAllOption: true });
        await writeTo(h, bytes);
        useProject.setState({ handle: h, dirty: false, name: baseName(h.name) });
        st.setToast(`已儲存「${h.name}」`);
      } catch (err) { if ((err as Error).name !== 'AbortError') throw err; }
      return;
    }
    download(bytes, `${baseName(st.name)}.rc`);
    useProject.setState({ dirty: false });
    st.setToast(`已下載「${baseName(st.name)}.rc」`);
  } catch (err) {
    st.setToast(`儲存失敗：${(err as Error).message}`, 'err');
  }
}

export function renameProject() {
  const n = prompt('專案名稱', useProject.getState().name);
  if (n && n.trim()) useProject.getState().setName(baseName(n.trim()).slice(0, 100));
}
