// midscene-ai-e2e-suite 入口
// 上层业务 Demo：仅调用 @midscene/web 官方公开 API，不修改任何 midscene 源码。
import 'dotenv/config'; // 自动加载 .env 环境变量
import { chromium, type Page } from 'playwright';
import { PlaywrightAgent } from '@midscene/web/playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// 运行产物目录配置
// MIDSCENE_RUN_DIR 指定后，Midscene 内置报告会输出到 <MIDSCENE_RUN_DIR>/report，
// 即 ./output/report，从而满足“使用 midscene 内置能力输出 HTML 报告”的要求。
// ---------------------------------------------------------------------------
const OUTPUT_DIR = './output';
const SNAP_DIR = join(OUTPUT_DIR, 'snap');
const MAX_RETRY = 2; // 最大重试次数（首次 + 2 次重试 = 最多 3 次尝试）

// 单个用例执行结果
interface CaseResult {
  name: string;
  success: boolean;
  attempts: number;
  error?: string;
}

// 收集到的执行 dump（由 agent.addDumpUpdateListener 钩子实时推送）
const collectedDumps: string[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 确保产物目录存在
async function ensureDirs(): Promise<void> {
  await mkdir(SNAP_DIR, { recursive: true });
}

/**
 * 判断异常是否属于可重试的“瞬时异常”：网络异常或 AI 识别/定位/规划类异常。
 * 此类异常重试通常有机会成功；其它（如配置错误）则不再重试。
 */
function isTransientError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  // 网络 / 超时 / HTTP 状态类
  const networkHit = /(network|timeout|econnreset|enotfound|socket|fetch|aborted|rate|429|5\d{2}|connect|dns)/.test(
    message,
  );
  // AI 识别 / 定位 / 规划 / 模型类
  const aiHit = /(ai |model|locate|locat|plan|recogni|vision|element not|cannot|unable|invalid)/.test(message);
  return networkHit || aiHit;
}

/**
 * 异常时把当前页面截图保存到 ./output/snap，便于事后排查。
 * 截图本身失败也不能影响主流程，故内部吞掉异常。
 */
async function saveScreenshot(page: Page, caseName: string, attempt: number): Promise<void> {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(SNAP_DIR, `${caseName}-attempt${attempt}-${stamp}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  📸 失败截图已保存: ${file}`);
  } catch (e) {
    console.warn(`  ⚠️ 截图保存失败（${caseName}）:`, e instanceof Error ? e.message : e);
  }
}

interface RunOptions {
  page: Page;
  caseName: string;
  action: () => Promise<void>;
}

/**
 * 工具函数：带重试地执行单个 AI 用例。
 * - 最大重试 MAX_RETRY 次
 * - 捕获网络、AI 识别等异常
 * - 异常时保存页面截图到 ./output/snap
 * - 单个用例失败不抛出，返回失败结果，保证整体程序继续
 */
async function runAiActionWithRetry({ page, caseName, action }: RunOptions): Promise<CaseResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= 1 + MAX_RETRY; attempt++) {
    try {
      console.log(`\n▶ [${caseName}] 第 ${attempt}/${1 + MAX_RETRY} 次尝试开始 ...`);
      await action();
      console.log(`✅ [${caseName}] 第 ${attempt} 次尝试成功`);
      return { name: caseName, success: true, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`❌ [${caseName}] 第 ${attempt} 次尝试失败: ${lastError}`);
      await saveScreenshot(page, caseName, attempt);

      // 仅对网络/AI 类瞬时异常进行重试，其它异常直接结束
      if (!isTransientError(err)) {
        console.warn(`  该异常不可重试，终止用例 [${caseName}]`);
        break;
      }
      if (attempt <= MAX_RETRY) {
        const backoff = 1000 * attempt;
        console.log(`  等待 ${backoff}ms 后重试 ...`);
        await sleep(backoff);
      }
    }
  }

  return { name: caseName, success: false, attempts: 1 + MAX_RETRY, error: lastError };
}

// ---------------------------------------------------------------------------
// 演示用例 1：打开百度，搜索“测试自动化”
// ---------------------------------------------------------------------------
function caseBaiduSearch(page: Page, agent: PlaywrightAgent): () => Promise<void> {
  return async () => {
    await page.goto('https://www.baidu.com', { waitUntil: 'domcontentloaded' });
    await sleep(1000);
    // 用自然语言驱动：在搜索框输入关键词并回车
    await agent.aiAct('在页面顶部的搜索输入框中输入“测试自动化”，然后按下回车键提交搜索');
    // 等待搜索结果出现
    await agent.aiWaitFor('搜索结果页已加载完成，能看到搜索结果列表');
    // AI 断言：确认结果与关键词相关
    await agent.aiAssert('页面上展示了与“测试自动化”相关的搜索结果');
  };
}

// ---------------------------------------------------------------------------
// 演示用例 2：访问公开表单演示页面并填写表单
// 使用 httpbin 提供的简单公开表单（披萨订单表单），稳定且结构简单。
// ---------------------------------------------------------------------------
function caseFormDemo(page: Page, agent: PlaywrightAgent): () => Promise<void> {
  return async () => {
    await page.goto('https://httpbin.org/forms/post', { waitUntil: 'domcontentloaded' });
    await sleep(1000);
    // 用自然语言驱动：填写表单字段
    await agent.aiAct(
      '在 customer name 输入框填写“Midscene Tester”，在 telephone 输入框填写“13800138000”，在 email 输入框填写“tester@midscene.dev”',
    );
    // AI 断言：确认表单已正确填写
    await agent.aiAssert('表单中的顾客姓名已填写为“Midscene Tester”');
  };
}

/**
 * 校验多模态视觉模型环境变量是否配置齐全。
 * 缺少时给出明确提示，避免后续 model 调用出现含糊报错。
 */
function assertModelEnv(): void {
  const required = [
    'MIDSCENE_MODEL_BASE_URL',
    'MIDSCENE_MODEL_API_KEY',
    'MIDSCENE_MODEL_NAME',
    'MIDSCENE_MODEL_FAMILY',
  ];
  const missing = required.filter((k) => !process.env[k] || process.env[k]?.includes('replace-with-your'));
  if (missing.length > 0) {
    console.warn('⚠️ 缺少多模态 VL 视觉模型配置，请在 .env 中设置：');
    for (const k of missing) {
      console.warn(`   - ${k}`);
    }
    console.warn('   纯文本大模型无法运行 Midscene，必须使用多模态视觉模型。');
  }
}

async function main(): Promise<void> {
  // 指定 Midscene 运行产物根目录，内置报告将写入 ./output/report
  process.env.MIDSCENE_RUN_DIR = process.env.MIDSCENE_RUN_DIR || OUTPUT_DIR;

  assertModelEnv();
  await ensureDirs();

  // 启动浏览器（云端若缺少系统依赖可能在此报错，属环境限制）
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  // 初始化 Midscene 官方 PlaywrightAgent（公开 API，不修改其源码）
  const agent = new PlaywrightAgent(page, {
    generateReport: true, // 复用 midscene 内置报告生成能力
    autoPrintReportMsg: true,
  });

  // 注册 dump 更新监听钩子，实时收集执行 dump
  const removeDumpListener = agent.addDumpUpdateListener((dump: string) => {
    collectedDumps.push(dump);
    console.log(`  📦 已收集执行 dump #${collectedDumps.length}（长度 ${dump.length} 字符）`);
  });

  const results: CaseResult[] = [];

  try {
    // 顺序执行两个演示用例
    results.push(
      await runAiActionWithRetry({
        page,
        caseName: 'baidu-search',
        action: caseBaiduSearch(page, agent),
      }),
    );

    results.push(
      await runAiActionWithRetry({
        page,
        caseName: 'form-demo',
        action: caseFormDemo(page, agent),
      }),
    );

    // 控制台汇总
    const success = results.filter((r) => r.success).length;
    const failed = results.length - success;
    console.log('\n==================================================');
    console.log('📊 用例执行汇总');
    console.log('==================================================');
    for (const r of results) {
      const tag = r.success ? '✅ PASS' : '❌ FAIL';
      console.log(`${tag}  ${r.name}  (尝试 ${r.attempts} 次)${r.error ? `  - ${r.error}` : ''}`);
    }
    console.log('--------------------------------------------------');
    console.log(`成功: ${success} / 失败: ${failed} / 总计: ${results.length}`);
    console.log(`执行 dump 收集总数: ${collectedDumps.length}`);
    console.log(`HTML 报告目录: ${join(OUTPUT_DIR, 'report')}（Midscene 内置生成）`);
    console.log(`失败截图目录: ${SNAP_DIR}`);
    console.log('==================================================');
  } finally {
    // 卸载监听器并销毁 agent，确保报告落盘
    removeDumpListener();
    try {
      await agent.destroy();
    } catch (e) {
      console.warn('agent.destroy 异常（已忽略）:', e instanceof Error ? e.message : e);
    }
    await browser.close();
    console.log('\n浏览器已关闭，程序执行完毕。');
  }
}

// 统一兜底：任何未捕获异常都不应静默
main().catch((err) => {
  console.error('\n💥 程序异常退出:', err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
