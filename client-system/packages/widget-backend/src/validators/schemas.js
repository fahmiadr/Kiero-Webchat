import { z } from 'zod';

export const preChatSchema = z.object({
    name: z.string().min(2).max(100).trim(),
    email: z.email().trim().toLowerCase()
});

export const messageSchema = z.object({
    messageId: z.uuid(),
    content: z.string().min(1).max(5000),
    type: z.enum(['text', 'image', 'audio', 'document', 'location']).default('text'),
    attachmentUrl: z.string().url().optional()
});

export const webhookSchema = {
    incomingMessage: {
        body: z.object({
            interaction_id: z.string(),
            message_id: z.string(),
            content: z.string(),
            type: z.enum(['text', 'image', 'audio', 'document', 'location']),
            flag_to: z.enum(['agent', 'customer']),
            agent_handle: z.string().optional(),
            is_bot: z.boolean().optional()
        })
    }
};

export const ratingSchema = z.object({
    rating: z.number().int().min(1).max(5),
    feedback: z.string().max(1000).optional()
});

export function validate(schema) {
    return async (request, reply) => {
        const result = schema.safeParse(request.body);
        if (!result.success) {
            return reply.status(422).send({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Validation failed',
                    details: result.error.flatten().fieldErrors
                }
            });
        }
        request.validated = result.data;
    };
}
