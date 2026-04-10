"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

const JoditEditor = dynamic(() => import("jodit-react"), { ssr: false });

const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48];

const KOREAN_FONTS = [
  "Malgun Gothic",
  "Noto Sans KR",
  "Nanum Gothic",
  "Nanum Myeongjo",
  "Nanum Pen Script",
  "Black Han Sans",
  "Arial",
  "Georgia",
];

const colorCircleSVG = (color = "#000000") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${color}" stroke="#aaa" stroke-width="1"/></svg>`;

interface Props {
  value: string;
  onChange: (html: string) => void;
}

export default function RichEditor({ value, onChange }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const [fontSize, setFontSize] = useState("12");
  const widgetsRef = useRef<{ ColorPickerWidget: any; TabsWidget: any } | null>(null);
  const tokenRef = useRef<string>("");

  useEffect(() => {
    Promise.all([
      import("jodit/esm/modules/widget/color-picker/color-picker"),
      import("jodit/esm/modules/widget/tabs/tabs"),
    ]).then(([cp, tabs]) => {
      widgetsRef.current = {
        ColorPickerWidget: cp.ColorPickerWidget,
        TabsWidget: tabs.TabsWidget,
      };
    });
  }, []);

  useEffect(() => {
    const refresh = async () => {
      if (auth.currentUser) tokenRef.current = await getIdToken(auth.currentUser);
    };
    refresh();
    const id = setInterval(refresh, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const config = useMemo(() => ({
    readonly: false,
    height: 340,
    language: "ko",
    toolbarButtonSize: "small" as const,
    buttons: [
      "bold", "italic", "underline", "strikethrough", "|",
      "font", "brush", "|",
      "ul", "ol", "|",
      "align", "|",
      "link", "image", "table", "|",
      "source",
    ],
    uploader: {
      url: "/api/image",
      method: "POST",
      format: "json",
      prepareData: (formData: FormData) => {
        formData.append("token", tokenRef.current);
        return formData;
      },
      isSuccess: (resp: any) => resp.error === 0,
      getMessage: (resp: any) => resp.msg ?? "",
      process: (resp: any) => resp,
      defaultHandlerSuccess: function (this: any, resp: any) {
        const editor = (editorRef.current as any) ?? this.j ?? this.jodit;
        if (!editor) return;
        (resp.files ?? []).forEach((url: string) => {
          const abs = `${location.origin}${url}`;
          editor.s.insertHTML(`<img src="${abs}" style="max-width:100%;" />`);
        });
      },
    },
    filebrowser: { ajax: { url: "" } },
    removeButtons: ["fontsize"],
    showXPathInStatusbar: false,
    showCharsCounter: false,
    showWordsCounter: false,
    toolbarAdaptive: false,
    askBeforePasteHTML: false,
    askBeforePasteFromWord: false,
    defaultActionOnPaste: "insert_clear_html" as const,
    defaultFontSizePoints: "pt" as const,
    colorPickerDefaultTab: "color" as const,
    style: { color: "#000000" },
    controls: {
      font: {
        list: Object.fromEntries(KOREAN_FONTS.map((f) => [f, f])),
      },
      brush: {
        icon: colorCircleSVG(),
        exec: (editor: any, _current: any, { button }: any) => {
          if (!button?.__lastCmd || !button?.__lastColor) return false;
          editor.selection?.focus();
          editor.execCommand(button.__lastCmd, false, button.__lastColor);
        },
        update: (_editor: any, button: any) => {
          if (!button?.__lastColor) return;
          setTimeout(() => {
            const circle = button.container?.querySelector("circle");
            if (circle) circle.setAttribute("fill", button.__lastColor);
          }, 0);
        },
        popup: (editor: any, _current: any, close: any, button: any) => {
          const widgets = widgetsRef.current;
          if (!widgets) return;
          const { ColorPickerWidget, TabsWidget } = widgets;

          function applyAndClose(cmd: string, value: string) {
            editor.execCommand(cmd, false, value);
            if (button) {
              button.__lastCmd = cmd;
              button.__lastColor = value;
              const circle = button.container?.querySelector("circle");
              if (circle) circle.setAttribute("fill", value);
            }
            close();
          }

          // 텍스트 색상 탭
          const colorTab = ColorPickerWidget(
            editor,
            (value: string) => applyAndClose("forecolor", value),
            ""
          );

          // 배경색 탭 — 투명 버튼 포함
          const bgWrap = document.createElement("div");

          const transparentBtn = document.createElement("button");
          transparentBtn.textContent = "✕ 배경 투명";
          transparentBtn.style.cssText = `
            display: block; width: 100%; padding: 5px 8px; margin-bottom: 6px;
            border: 1px solid #ddd; border-radius: 4px; cursor: pointer;
            background: white; font-size: 12px; color: #333; text-align: left;
          `;
          transparentBtn.onmouseenter = () => { transparentBtn.style.background = "#f5f5f5"; };
          transparentBtn.onmouseleave = () => { transparentBtn.style.background = "white"; };
          transparentBtn.onclick = () => {
            editor.execCommand("background", false, "");
            close();
          };

          const bgPicker = ColorPickerWidget(
            editor,
            (value: string) => applyAndClose("background", value),
            ""
          );

          bgWrap.appendChild(transparentBtn);
          bgWrap.appendChild(bgPicker);

          return TabsWidget(editor, [
            { name: "Text", content: colorTab },
            { name: "Background", content: bgWrap },
          ]);
        },
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  function applyFontSize(size: string) {
    const editor = editorRef.current as any;
    if (!editor) return;
    editor.selection?.focus();
    editor.execCommand("fontsize", false, size);
    setFontSize(size);
    setTimeout(() => {
      const editorEl = editor.editor as HTMLElement;
      if (!editorEl) return;
      editorEl.querySelectorAll<HTMLElement>("li").forEach((li) => {
        const span = li.querySelector<HTMLElement>('span[style*="font-size"]');
        if (span) li.style.fontSize = span.style.fontSize;
      });
    }, 0);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="relative">
        <div className="absolute right-[8px] top-[3px] z-10">
          <select
            value={fontSize}
            onChange={(e) => applyFontSize(e.target.value)}
            className="h-[22px] text-xs text-black border border-zinc-300 rounded bg-white px-1 cursor-pointer"
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={`${s}`}>{s}pt</option>
            ))}
          </select>
        </div>
        <JoditEditor
          ref={editorRef as any}
          value={value}
          config={config}
          onBlur={onChange}
        />
      </div>
    </div>
  );
}
