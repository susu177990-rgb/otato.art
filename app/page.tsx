import Image from "next/image";
import Link from "next/link";
import { TopbarAccountActions } from "@/components/TopbarAccountActions";
import styles from "./home-page.module.css";

const GITHUB_URL = "https://github.com/susu177990-rgb/otato.art";

const problems = [
  ["01", "流程太散", "对话、剧本、参考图、生成结果和最终素材分散在多个工具之间，项目越做越乱。"],
  ["02", "提示词留不住", "有效方法经常只存在于某次聊天记录里，下一次又要重新翻、重新改、重新试。"],
  ["03", "模型切换麻烦", "不同模型、网关、密钥和参数分散管理，每次创作都要在配置和平台之间来回切。"],
  ["04", "结果难复用", "生成后的图片、视频、画布素材和项目历史没有被结构化沉淀，很难继续整理和二次创作。"],
] as const;

const useModes = [
  ["系统 API 模式", "站点统一模型配置", "管理员在后台维护模型和网关，普通用户直接使用已配置的创作能力。"],
  ["积分模式", "无密钥也能使用", "用户无需接入第三方 API Key，可以通过站内额度调用已配置的模型能力。"],
  ["统一管理", "模型能力集中维护", "LLM、图片、视频配置由站点统一管理，避免用户在多个平台之间反复配置。"],
] as const;

const models = [
  ["对话与推理", "用于创意拆解、剧本规划、提示词编写、项目复盘。", ["OpenAI", "Claude", "Gemini", "DeepSeek"]],
  ["图片生成", "用于角色图、场景图、参考图、视觉资产生产。", ["GPT Image", "Nano Banana", "自定义网关"]],
  ["视频生成", "用于分镜动态化、短片生成、镜头测试和素材管理。", ["Seedance", "Veo", "可灵"]],
  ["视觉理解", "用于参考图分析、构图拆解、角色资产理解和提示词反推。", ["多模态模型", "图像分析", "项目资产"]],
] as const;

const features = [
  ["对话工作台", "用 Agent、多会话和 Skill 拆解需求、整理方案、生成提示词和推进项目。", ["多会话", "创意拆解", "方案整理"]],
  ["图片生成", "通过模式化生图、参考图、历史记录和参数配置生产可复用视觉资产。", ["参考图", "历史记录", "视觉资产"]],
  ["视频生成", "管理视频任务、镜头提示词、生成状态和动态素材记录。", ["生视频", "镜头设计", "任务记录"]],
  ["剧本项目", "管理项目立项、人物设定、世界观、分集内容和场景规划。", ["角色", "分集", "故事线"]],
  ["无限画布", "把灵感、参考图、分镜、角色、场景和生成结果放在可视空间里组织。", ["素材关系", "分镜墙", "灵感整理"]],
  ["提示词预设", "搜索、收藏、复制、维护和复用提示词结构，让有效方法可以沉淀下来。", ["收藏", "复制", "标签"]],
  ["画廊资产库", "集中查看图片、视频和项目结果，把生成内容继续整理成资产。", ["图片", "视频", "复用"]],
  ["账号与模型配置", "统一管理模型、网关、密钥、积分和使用方式，让创作入口更清楚。", ["密钥", "积分", "网关"]],
] as const;

const useCases = [
  ["短剧创作", "沉淀角色、人设、分集、分镜、参考图和视频生成记录。"],
  ["MV 与短片", "把歌词、镜头、角色表演、视觉风格和生成素材放进同一个项目。"],
  ["角色设定", "长期维护角色图、服装、道具、表情、场景和一致性提示词。"],
  ["提示词方法库", "把自己验证过的提示词结构做成预设，下一次直接复用。"],
] as const;

const presetItems = [
  ["电影感图片反推", "适合把参考图拆成构图、光线、镜头和质感。"],
  ["短剧分镜导演", "适合把剧情拆成可生成的视频镜头。"],
  ["角色资产锁定", "适合长期项目里保持人物、服装和道具一致。"],
  ["Seedance 视频提示词", "适合把动作、表演、运镜和时长写清楚。"],
] as const;

function HomeContent() {
  return (
    <main className={styles.page} id="top">
      <header className={styles.siteHeader}>
        <div className={[styles.container, styles.nav].join(" ")}>
          <Link className={styles.brand} href="#top" aria-label="oTATo Art 首页">
            <Image src="/oTATo.svg" alt="oTATo Art 标志" width={43} height={43} priority />
            <span>oTATo Art</span>
          </Link>
          <nav className={styles.navLinks} aria-label="主导航">
            <Link href="#problem">解决问题</Link>
            <Link href="#use">使用方式</Link>
            <Link href="#models">模型配置</Link>
            <Link href="#features">功能模块</Link>
            <Link href="#presets">预设库</Link>
          </nav>
          <div className={styles.navActions}>
            <Link className={[styles.btn, styles.ghost].join(" ")} href={GITHUB_URL} target="_blank" rel="noreferrer">
              查看仓库
            </Link>
            <Link className={[styles.btn, styles.primary].join(" ")} href="/projects">
              进入工作台
            </Link>
            <TopbarAccountActions linkClassName={styles.btn} />
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={[styles.container, styles.heroGrid].join(" ")}>
          <div>
            <div className={styles.eyebrow}>
              <span className={styles.spark} /> 面向创作者的 AI 内容生产系统
            </div>
            <h1>
              把 AI 内容创作，放进一个<span className={styles.mark}>真正连续</span>的工作台。
            </h1>
            <p className={styles.lead}>
              oTATo Art 把对话、图片、视频、剧本、画布、画廊、系统模型配置和提示词预设放在同一个流程里。用户无需接入第三方 API Key，即可使用站点已配置的创作能力。
            </p>
            <div className={styles.heroActions}>
              <Link className={[styles.btn, styles.red].join(" ")} href="/projects">
                立即访问网站
              </Link>
              <Link className={styles.btn} href={GITHUB_URL} target="_blank" rel="noreferrer">
                查看 GitHub 仓库
              </Link>
              <Link className={[styles.btn, styles.ghost].join(" ")} href="#presets">
                了解预设库
              </Link>
            </div>
            <div className={styles.miniPoints}>
              <span>内置主流模型配置</span>
              <span>绑定密钥即可使用</span>
              <span>无密钥可用积分</span>
              <span>社区化提示词预设</span>
            </div>
          </div>

          <HeroWorkspace />
        </div>
      </section>

      <section id="problem" className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            kicker="它解决什么问题"
            title="AI 创作真正麻烦的，不是生成一次。"
            copy="真正麻烦的是：灵感散在聊天里，提示词散在文档里，模型配置散在不同平台，图片视频结果散在文件夹，项目做久了很难复盘和继续推进。"
          />
          <div className={styles.problemGrid}>
            {problems.map(([num, title, copy]) => (
              <article className={styles.problemCard} key={title}>
                <div className={styles.cardIcon}>{num}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={[styles.container, styles.solutionShell].join(" ")}>
          <div className={styles.solutionRow}>
            <div className={styles.solutionText}>
              <Kicker>核心方案</Kicker>
              <h2>把创作链路装进同一个产品，而不是再多开一个工具。</h2>
              <p>
                oTATo Art 的首页不应该只介绍“有哪些模块”，而应该让用户理解：这里是一个可长期使用的创作系统。它适合从想法、角色、剧本、提示词、图片、视频，到素材归档的完整创作过程。
              </p>
              <div className={styles.pathList}>
                <div><span>1</span> 先用对话和预设拆解创意</div>
                <div><span>2</span> 再用剧本、图片和视频推进生产</div>
                <div><span>3</span> 最后用画布和画廊沉淀资产</div>
              </div>
            </div>
            <div className={styles.solutionMap}>
              <div className={styles.flowSteps}>
                {[
                  ["第一步", "创建项目，整理角色、故事、视觉方向和创作目标。"],
                  ["第二步", "选择社区预设或自己的私有预设，快速生成高质量提示词结构。"],
                  ["第三步", "按任务调用聊天、图片、视频或视觉模型，把结果保留在项目历史中。"],
                  ["第四步", "把素材放进画布、画廊和分镜中，持续迭代而不是一次性丢失。"],
                  ["第五步", "沉淀出自己的提示词方法、角色资产和长期项目工作流。"],
                ].map(([step, copy]) => (
                  <div className={styles.flowStep} key={step}>
                    <b>{step}</b>
                    <p>{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="use" className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            kicker="怎么使用"
            title="有密钥就绑定密钥，没有密钥就用积分。"
            copy="首页必须把使用门槛说清楚：oTATo Art 既适合有自己 API 资源的用户，也适合没有密钥、只想开箱即用的创作者。"
          />
          <div className={styles.modeGrid}>
            {useModes.map(([badge, title, copy]) => (
              <article className={styles.modeCard} key={title}>
                <span className={styles.modeBadge}>{badge}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="models" className={styles.section}>
        <div className={[styles.container, styles.modelSection].join(" ")}>
          <SectionHead
            kicker="模型配置"
            title="内置主流模型配置，少折腾接口，多专注创作。"
            copy="模型配置不应该藏在角落。首页要明确告诉用户：聊天、图片、视频、视觉理解和动作控制类模型都可以被统一管理，绑定密钥后即可进入创作流程。"
            dark
          />
          <div className={styles.modelGrid}>
            {models.map(([title, copy, pills]) => (
              <article className={styles.modelCard} key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
                <div className={styles.modelList}>
                  {pills.map((pill) => <span className={styles.pill} key={pill}>{pill}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            kicker="功能模块"
            title="不是堆按钮，而是给内容项目准备的一套工作流。"
            copy="每个模块都要服务同一个目标：让创作者能围绕一个项目持续推进、持续复用、持续整理，而不是一次生成后就断掉。"
          />
          <div className={styles.featuresGrid}>
            {features.map(([title, copy, tags]) => (
              <article className={styles.featureCard} key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
                <div className={styles.featureMeta}>
                  {tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="presets" className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            kicker="社区化预设库"
            title="把好用的提示词方法，变成可以搜索和复用的资产。"
            copy="预设库应该是首页重点。它不是一个普通收藏夹，而是创作者之间沉淀方法、分享结构、复用流程的地方。公开视频、短剧、角色、分镜、生图、生视频方法都可以在这里变成可用预设。"
          />
          <div className={styles.presetsWrap}>
            <div className={styles.presetCard}>
              <div className={styles.searchBox}>搜索预设：角色锁定 / 分镜 / 生视频 / 画风继承</div>
              <div className={styles.presetList}>
                {presetItems.map(([title, copy]) => (
                  <div className={styles.presetItem} key={title}>
                    <b>{title}</b>
                    <small>{copy}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.presetPreview}>
              <div className={styles.presetPreviewHead}>
                <b>预设详情</b>
                <Link className={styles.copyBtn} href="/prompt">复制并使用</Link>
              </div>
              <div className={styles.presetCode}>
                <strong>名称：</strong>短剧分镜导演<br />
                <strong>用途：</strong>把剧情、角色、场景和镜头语言整理成可执行的生成提示词。<br />
                <div className={styles.line} /><div className={styles.line} /><div className={styles.line} /><div className={styles.line} />
                <div className={styles.promptTags}><span>社区共享</span><span>可收藏</span><span>可二次编辑</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHead
            kicker="适用场景"
            title="给长期内容项目，而不是一次性玩具。"
            copy="首页应该直接告诉用户哪些人会用它、为什么会用它、什么时候会离不开它。"
          />
          <div className={styles.useGrid}>
            {useCases.map(([title, copy]) => (
              <article className={styles.useCard} key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={[styles.container, styles.ctaBox].join(" ")}>
          <div>
            <h2>从一个灵感开始，把完整项目沉淀下来。</h2>
            <p>进入 oTATo Art，直接使用站点已配置的系统 API 和额度。把你的对话、提示词、剧本、图片、视频、画布和画廊放进同一个创作系统。</p>
          </div>
          <Link className={styles.btn} href="/projects">进入工作台</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={[styles.container, styles.footerRow].join(" ")}>
          <div>oTATo Art｜开源 AI 内容创作工作台</div>
          <div>访问网站 · 查看仓库 · 设计规范</div>
        </div>
      </footer>
    </main>
  );
}

function Kicker({ children, dark = false }: { children: string; dark?: boolean }) {
  return <div className={[styles.kicker, dark ? styles.kickerDark : ""].filter(Boolean).join(" ")}>{children}</div>;
}

function SectionHead({ kicker, title, copy, dark = false }: { kicker: string; title: string; copy: string; dark?: boolean }) {
  return (
    <div className={styles.sectionHead}>
      <div>
        <Kicker dark={dark}>{kicker}</Kicker>
        <h2>{title}</h2>
      </div>
      <p className={styles.sectionCopy}>{copy}</p>
    </div>
  );
}

function HeroWorkspace() {
  return (
    <div className={styles.heroVisual} aria-label="oTATo Art 工作台界面示意">
      <div className={[styles.heroDoodle, styles.doodleLeft].join(" ")} aria-hidden="true">
        <span>✧</span>
        <i />
        <i />
      </div>
      <div className={[styles.heroDoodle, styles.doodleRight].join(" ")} aria-hidden="true">
        <span>✧</span>
        <i />
        <i />
      </div>
      <div className={styles.potatoSticker}><Image src="/oTATo.svg" alt="oTATo Art 标志" width={70} height={70} /></div>
      <div className={styles.workspace}>
        <div className={styles.windowBar}>
          <div className={styles.traffic}><i /><i /><i /></div>
          <span>oTATo Art</span>
        </div>
        <div className={styles.workspaceBody}>
          <aside className={styles.side}>
            <div className={styles.sideTitle}>工作区</div>
            {["对话", "图片", "视频", "剧本", "画布", "预设", "画廊"].map((item, index) => (
              <div key={item} className={[styles.sideItem, index === 0 ? styles.active : ""].filter(Boolean).join(" ")}>
                <b />{item}
              </div>
            ))}
          </aside>
          <div className={styles.mainPanel}>
            <div className={styles.panelTop}>
              <div className={styles.panelStack}>
                <div className={styles.promptBox}>
                  <h3>正在制作：短剧视觉方案</h3>
                  <p>拆解短片设定、角色资产、分镜节奏和视觉参考，把生成策略沉淀为可复用流程。</p>
                  <div className={styles.promptTags}><span>角色设定</span><span>分镜</span><span>剧本与人物</span><span>场景参考</span></div>
                </div>
                <div className={styles.progressBox}>
                  <h3>AI 输出与进度</h3>
                  <div className={styles.progressLine}>
                    <span>✓</span>
                    <p>已生成：分镜草图、角色设定提示词、场景图需求、画廊标签。</p>
                  </div>
                  <div className={styles.progressTrack}><i /></div>
                </div>
              </div>
              <div className={styles.creditBox}>
                <h3>可用积分</h3>
                <div className={styles.creditNum}>8,420</div>
                <p>无需自带密钥，直接用站点额度调用模型。</p>
              </div>
            </div>
            <div className={styles.flowBoard}>
              <svg className={styles.flowConnections} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 27 22 C 38 22, 38 70, 45 70" />
                <path d="M 61 24 C 51 24, 51 70, 57 70" />
                <path d="M 61 74 C 73 74, 72 84, 79 84" />
              </svg>
              <div className={[styles.node, styles.n1].join(" ")}>提示词预设<small>一键复用结构</small></div>
              <div className={[styles.node, styles.n2].join(" ")}>剧本与人物<small>持续管理项目</small></div>
              <div className={[styles.node, styles.n3].join(" ")}>画廊与素材<small>统一沉淀资产</small></div>
              <div className={[styles.node, styles.n4].join(" ")}>视频生成<small>镜头与动态记录</small></div>
            </div>
          </div>
        </div>
      </div>
      <FloatingHeroCard
        className={styles.floatPreset}
        icon="✧"
        title="提示词预设"
        copy="一键复用结构，快速启用创作思路。"
      />
      <FloatingHeroCard
        className={styles.floatVideo}
        icon="▶"
        title="视频生成"
        copy="支持 Seedance、Veo 等模型，生成任务、动态素材和历史记录继续管理。"
      />
      <FloatingHeroCard
        className={styles.floatGallery}
        icon="▧"
        title="画廊"
        copy="图片、视频、参考资产统一沉淀，随时复用。"
      />
    </div>
  );
}

function FloatingHeroCard({ className, icon, title, copy }: { className: string; icon: string; title: string; copy: string }) {
  return (
    <div className={[styles.floatingHeroCard, className].join(" ")}>
      <div className={styles.floatIcon}>{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
