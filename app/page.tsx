"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, Suspense, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BRAND_NAME } from "@/lib/branding";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import shellStyles from "./shared/shell.module.css";

type HomeNavIconName = "chat" | "image" | "video" | "script" | "canvas" | "preset" | "gallery";
type HomePanelId = "home" | HomeNavIconName;

const HOME_NAV_ITEMS: Array<{
  title: string;
  meta: string;
  href: string;
  icon: HomeNavIconName;
}> = [
  { title: "对话", meta: "Agent · Skill · 多会话", href: "/chat", icon: "chat" },
  { title: "图片", meta: "模式化生图 · 画廊", href: "/image", icon: "image" },
  { title: "视频", meta: "模式化生视频 · 记录", href: "/video", icon: "video" },
  { title: "剧本", meta: "项目列表 · 立项 · 编剧室", href: "/projects", icon: "script" },
  { title: "画布", meta: "素材编排 · 分镜关系 · 灵感板", href: "/canvas", icon: "canvas" },
  { title: "预设", meta: "搜索 · 收藏 · 一键复制", href: "/prompt", icon: "preset" },
  { title: "画廊", meta: "查看生图记录", href: "/image/gallery", icon: "gallery" },
];

const HOME_PANEL_CONTENT: Array<{
  id: HomePanelId;
  eyebrow: string;
  title: string;
  lead: string;
  description: string;
  chips: string[];
  cta?: { label: string; href: string };
}> = [
  {
    id: "home",
    eyebrow: "开放创作工作台",
    title: "去皮土豆 oTATo Art",
    lead: "自带 API 自由，提示词也能共享",
    description:
      "一个面向创作者的开源 AI 内容创作工作台：自由配置 API，使用和分享提示词预设，把对话、图片、视频、剧本、画布和画廊放进同一条创作流程。",
    chips: ["自定义 API", "社区提示词", "开源项目"],
    cta: { label: "Github", href: "https://github.com/susu177990-rgb/otato.art" },
  },
  {
    id: "chat",
    eyebrow: "对话模式",
    title: "对话推进创作",
    lead: "Agent 与 Skill，接住多会话上下文。",
    description: "适合灵感记录、方案拆解和角色协作。每轮对话都保留线索，让 AI 不只是回答问题，而是陪你把创作继续做下去。",
    chips: ["多会话", "Agent 协作", "Skill 调用"],
  },
  {
    id: "image",
    eyebrow: "图片模式",
    title: "图片生成入库",
    lead: "参考图进模式，结果沉淀到画廊。",
    description: "从模式、参考图到模型选择都放在同一入口。生成结果可以回看、筛选和继续使用，逐步形成自己的视觉素材库。",
    chips: ["AI 图片生成", "参考图", "画廊沉淀"],
  },
  {
    id: "video",
    eyebrow: "视频模式",
    title: "视频素材生长",
    lead: "文生、图生和动态记录，接住短片素材。",
    description: "把画面设想、首帧参考和动态描述放在一起。减少在平台之间搬运素材，让短片、分镜和动态资产更容易接上。",
    chips: ["AI 视频生成", "首帧参考", "记录回看"],
  },
  {
    id: "script",
    eyebrow: "剧本模式",
    title: "剧本项目成形",
    lead: "项目、人物和分集，按长期节奏组织。",
    description: "适合短剧、系列内容和长线 IP。把立项、人物、世界观和分集内容放进项目里，避免设定散落在多个文档。",
    chips: ["项目立项", "编剧室", "分集创作"],
  },
  {
    id: "canvas",
    eyebrow: "画布模式",
    title: "画布整理灵感",
    lead: "素材节点铺开，灵感关系变成地图。",
    description: "在可视空间里摆放素材、连接分镜、整理灵感。创作过程不再只是列表，而是一张可以继续扩展的结构图。",
    chips: ["无限画布", "素材编排", "分镜关系"],
  },
  {
    id: "preset",
    eyebrow: "预设模式",
    title: "提示词共创库",
    lead: "好用、好玩、可复用，为共享而设计。",
    description: "现在可以收藏和使用预设；后续会面向用户上传与共享。让每个创作者都能贡献自己的提示词方法。",
    chips: ["提示词预设", "收藏复用", "面向共享"],
  },
  {
    id: "gallery",
    eyebrow: "画廊模式",
    title: "画廊沉淀资产",
    lead: "生成记录和素材资产，集中留在画廊。",
    description: "生成不是一次性动作。画廊把图片、视频和创作结果沉淀下来，方便之后筛选、回看和再次创作。",
    chips: ["生成记录", "素材资产", "作品回看"],
  },
];

const HOME_PANEL_MAP_NODES: Array<{
  id: HomeNavIconName;
  label: string;
  meta: string;
  x: number;
  y: number;
  line: string;
}> = [
  { id: "chat", label: "对话", meta: "Agent", x: 118, y: 88, line: "M280 202 C236 158 194 118 148 104" },
  { id: "image", label: "图片", meta: "生成", x: 304, y: 58, line: "M294 178 C296 140 304 104 324 82" },
  { id: "video", label: "视频", meta: "动态", x: 432, y: 122, line: "M336 186 C372 160 404 140 432 134" },
  { id: "script", label: "剧本", meta: "项目", x: 96, y: 218, line: "M214 212 C172 212 136 220 112 236" },
  { id: "canvas", label: "画布", meta: "结构", x: 274, y: 318, line: "M282 256 C282 280 282 302 282 318" },
  { id: "preset", label: "预设", meta: "共享", x: 444, y: 286, line: "M340 232 C374 252 410 270 444 286" },
  { id: "gallery", label: "画廊", meta: "资产", x: 142, y: 336, line: "M236 252 C204 286 174 314 142 336" },
];

function HomeNavIcon({ name }: { name: HomeNavIconName }) {
  const common = { vectorEffect: "non-scaling-stroke" as const };

  return (
    <svg className={shellStyles.tileSvgIcon} viewBox="0 0 24 24" aria-hidden>
      {name === "chat" ? (
        <>
          <rect {...common} x="4" y="5" width="16" height="12" rx="3" />
          <path {...common} d="M8 17l-2.5 3" />
          <path {...common} d="M8 10h8" />
          <path {...common} d="M8 13h5" />
        </>
      ) : name === "image" ? (
        <>
          <rect {...common} x="4" y="5" width="16" height="14" rx="3" />
          <path {...common} d="m7 16 4-4 3 3 2-2 3 3" />
          <circle {...common} cx="15.5" cy="9.5" r="1.5" />
        </>
      ) : name === "video" ? (
        <>
          <rect {...common} x="4" y="6" width="13" height="12" rx="3" />
          <path {...common} d="m17 10 4-2v8l-4-2" />
        </>
      ) : name === "script" ? (
        <>
          <path {...common} d="M7 4h8l3 3v13H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path {...common} d="M15 4v4h4" />
          <path {...common} d="M8 12h8" />
          <path {...common} d="M8 15h6" />
        </>
      ) : name === "canvas" ? (
        <>
          <rect {...common} x="4" y="5" width="6" height="6" rx="2" />
          <rect {...common} x="14" y="5" width="6" height="6" rx="2" />
          <rect {...common} x="4" y="15" width="6" height="5" rx="2" />
          <rect {...common} x="14" y="15" width="6" height="5" rx="2" />
          <path {...common} d="M10 8h4" />
          <path {...common} d="M10 17.5h4" />
        </>
      ) : name === "preset" ? (
        <>
          <path {...common} d="M12 3l1.4 4.2L18 8.6l-4.1 2.2L12 15l-1.9-4.2L6 8.6l4.6-1.4L12 3z" />
          <path {...common} d="M5 16h5" />
          <path {...common} d="M14 18h5" />
          <path {...common} d="M7 20h8" />
        </>
      ) : (
        <>
          <rect {...common} x="4" y="7" width="12" height="10" rx="2.5" />
          <path {...common} d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4H18a2 2 0 0 1 2 2v8.5A1.5 1.5 0 0 1 18.5 16H16" />
          <path {...common} d="m6.5 15 3-3 2 2 1.5-1.5 2.5 2.5" />
          <circle {...common} cx="12.5" cy="10.5" r="1" />
        </>
      )}
    </svg>
  );
}

function HomePanelIllustration({ name }: { name: HomePanelId }) {
  const common = { vectorEffect: "non-scaling-stroke" as const };
  const activeNode = name === "home" ? null : name;

  return (
    <svg className={shellStyles.homePanelIllustrationSvg} viewBox="0 0 560 420" aria-hidden>
      <rect {...common} className={shellStyles.homePanelMapFrame} x="30" y="28" width="500" height="356" rx="34" />
      <path {...common} className={shellStyles.homePanelMapGrid} d="M70 118h420M70 208h420M70 298h420M154 66v278M282 66v278M410 66v278" />

      <g className={shellStyles.homePanelMapRail}>
        <rect {...common} x="62" y="52" width="104" height="34" rx="17" />
        <text x="114" y="74" textAnchor="middle">
          API 自由
        </text>
      </g>
      <g className={shellStyles.homePanelMapRail}>
        <rect {...common} x="382" y="48" width="116" height="34" rx="17" />
        <text x="440" y="70" textAnchor="middle">
          开源工作流
        </text>
      </g>
      <g className={shellStyles.homePanelMapRail}>
        <rect {...common} x="340" y="334" width="138" height="34" rx="17" />
        <text x="409" y="356" textAnchor="middle">
          提示词共享
        </text>
      </g>

      {HOME_PANEL_MAP_NODES.map((node) => {
        const isActive = activeNode === node.id;
        const lineClassName = [
          shellStyles.homePanelMapLine,
          activeNode === null || isActive ? shellStyles.homePanelMapLineActive : "",
        ]
          .filter(Boolean)
          .join(" ");

        return <path key={`${node.id}-line`} {...common} className={lineClassName} d={node.line} />;
      })}

      <g className={shellStyles.homePanelMapHub}>
        <rect {...common} x="206" y="160" width="148" height="96" rx="28" />
        <path {...common} d="M236 192h88M236 216h54" />
        <circle {...common} cx="322" cy="218" r="16" />
        <path {...common} d="M314 218h16M322 210v16" />
        <text x="280" y="244" textAnchor="middle">
          oTATo Art
        </text>
      </g>

      {HOME_PANEL_MAP_NODES.map((node) => {
        const isActive = activeNode === node.id;
        const nodeClassName = [
          shellStyles.homePanelMapNode,
          isActive ? shellStyles.homePanelMapNodeActive : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <g key={node.id} className={nodeClassName} transform={`translate(${node.x} ${node.y})`}>
            <rect {...common} x="-52" y="-24" width="104" height="60" rx="20" />
            <text className={shellStyles.homePanelMapNodeTitle} x="0" y="0" textAnchor="middle">
              {node.label}
            </text>
            <text className={shellStyles.homePanelMapNodeMeta} x="0" y="23" textAnchor="middle">
              {node.meta}
            </text>
          </g>
        );
      })}

      <g className={shellStyles.homePanelMapFocus}>
        <rect {...common} x="66" y="366" width={activeNode ? "168" : "178"} height="34" rx="17" />
        <text x={activeNode ? "150" : "155"} y="388" textAnchor="middle">
          {activeNode ? "当前模式已接入创作流" : "入口、资产、社区放在一起"}
        </text>
      </g>
    </svg>
  );
}

function ModeHomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeHomePanel, setActiveHomePanel] = useState<HomePanelId>("home");

  useEffect(() => {
    if (!projectParam) return;
    router.replace(`/studio/${projectParam}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectParam]);

  useEffect(() => {
    let mounted = true;

    try {
      const supabase = createSupabaseBrowserClient();

      void supabase.auth.getUser().then(({ data }) => {
        if (mounted) setIsLoggedIn(Boolean(data.user));
      });

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setIsLoggedIn(Boolean(session?.user));
      });

      return () => {
        mounted = false;
        listener.subscription.unsubscribe();
      };
    } catch {
      setIsLoggedIn(false);
      return () => {
        mounted = false;
      };
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/admin/me", { cache: "no-store" })
      .then((res) => {
        if (mounted) setIsAdmin(res.ok);
      })
      .catch(() => {
        if (mounted) setIsAdmin(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (projectParam) {
    return <div className={shellStyles.empty}>正在跳转…</div>;
  }

  return (
    <main className={[shellStyles.page, shellStyles.homePage].join(" ")}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <div className={shellStyles.topbarTagline}>
            {isAdmin ? (
              <Link href="/admin" aria-label="进入管理页" className={shellStyles.brandLogoLink}>
                <Image
                  src="/oTATo.svg"
                  alt={BRAND_NAME}
                  width={36}
                  height={36}
                  className={shellStyles.brandLogo}
                  priority
                />
              </Link>
            ) : (
              <Image
                src="/oTATo.svg"
                alt={BRAND_NAME}
                width={36}
                height={36}
                className={shellStyles.brandLogo}
                priority
              />
            )}
            <span className={shellStyles.brandWordmark}>oTATo Art</span>
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <Link href="/settings" className={shellStyles.navLink}>
            API设置
          </Link>
          <Link href={isLoggedIn ? "/me" : "/login?next=/"} className={shellStyles.navLink}>
            {isLoggedIn ? "我的" : "登录 / 注册"}
          </Link>
        </nav>
      </header>

      <div className={shellStyles.heroWrap}>
        <nav
          className={shellStyles.tileGrid}
          aria-label="工作台导航"
          onMouseLeave={() => setActiveHomePanel("home")}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setActiveHomePanel("home");
            }
          }}
        >
          {HOME_NAV_ITEMS.map((item, index) => (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              onFocus={() => setActiveHomePanel(item.icon)}
              onPointerEnter={() => setActiveHomePanel(item.icon)}
              onPointerMove={() => setActiveHomePanel(item.icon)}
              onMouseEnter={() => setActiveHomePanel(item.icon)}
              onMouseMove={() => setActiveHomePanel(item.icon)}
              className={shellStyles.tile}
              style={{ "--home-nav-delay": `${index * 90}ms` } as CSSProperties}
            >
              <span className={shellStyles.tileIcon}>
                <HomeNavIcon name={item.icon} />
              </span>
              <span className={shellStyles.tileCopy}>
                <span className={shellStyles.tileTitle}>{item.title}</span>
                <span className={shellStyles.tileMeta}>{item.meta}</span>
              </span>
            </button>
          ))}
        </nav>

        <section className={shellStyles.homeMainPanel} aria-label="工作台内容">
          <div className={shellStyles.homePanelViewport} aria-live="polite">
            {HOME_PANEL_CONTENT.map((panel) => {
              const isActive = activeHomePanel === panel.id;
              const titleId = `home-panel-${panel.id}-title`;
              const contentClassName = [
                shellStyles.homePanelContent,
                panel.id === "home" ? shellStyles.homePanelContentHome : "",
                isActive ? shellStyles.homePanelContentActive : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <article key={panel.id} className={contentClassName} aria-hidden={!isActive} aria-labelledby={titleId}>
                  <div className={shellStyles.homePanelActions}>
                    <span className={shellStyles.homePanelEyebrow}>{panel.eyebrow}</span>
                    {panel.cta ? (
                      <Link
                        href={panel.cta.href}
                        target="_blank"
                        rel="noreferrer"
                        className={shellStyles.homePanelCta}
                        tabIndex={isActive ? undefined : -1}
                      >
                        <span>{panel.cta.label}</span>
                        <svg className={shellStyles.homePanelCtaIcon} viewBox="0 0 16 16" aria-hidden>
                          <path d="M5 11 11 5" />
                          <path d="M6.5 5H11v4.5" />
                        </svg>
                      </Link>
                    ) : null}
                  </div>
                  {panel.id === "home" ? (
                    <h1 id={titleId} className={shellStyles.homePanelTitle}>
                      {panel.title}
                    </h1>
                  ) : (
                    <h2 id={titleId} className={shellStyles.homePanelTitle}>
                      {panel.title}
                    </h2>
                  )}
                  <div className={shellStyles.homePanelCopy}>
                    <p className={shellStyles.homePanelLead}>{panel.lead}</p>
                    <p className={shellStyles.homePanelDescription}>{panel.description}</p>
                    <div className={shellStyles.homePanelChips} aria-label={`${panel.eyebrow}能力`}>
                      {panel.chips.map((chip) => (
                        <span key={chip} className={shellStyles.homePanelChip}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
            <div className={shellStyles.homePanelArt} aria-hidden>
              <HomePanelIllustration name={activeHomePanel} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className={shellStyles.empty}>加载中…</div>}>
      <ModeHomeInner />
    </Suspense>
  );
}
