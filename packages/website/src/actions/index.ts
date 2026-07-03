import { z } from "astro/zod";
import { defineAction } from "astro:actions";

export const server = {
  /** 根据名字返回问候 */
  getGreeting: defineAction({
    input: z.object({
      name: z.string().min(1, "名字不能为空"),
    }),
    handler: async (input) => {
      const greetings = ["你好", "Hello", "Bonjour", "こんにちは", "Ciao"];
      const g = greetings[Math.floor(Math.random() * greetings.length)];
      return `${g}，${input.name}！`;
    },
  }),

  /** 点赞/取消赞 */
  like: defineAction({
    input: z.object({
      id: z.string(),
    }),
    handler: async (input, _ctx) => {
      // 模拟服务端计数
      // 实际项目中接入数据库
      return {
        id: input.id,
        likes: Math.floor(Math.random() * 100) + 1,
        liked: true,
      };
    },
  }),

  /** 提交反馈 */
  submitFeedback: defineAction({
    accept: "form",
    input: z.object({
      name: z.string().min(1, "请输入名字"),
      email: z.email("邮箱格式不正确"),
      message: z.string().min(5, "消息至少 5 个字符"),
    }),
    handler: async (input) => {
      // 模拟提交
      console.log("[feedback]", input);
      return { success: true, name: input.name };
    },
  }),
};
