FROM node:22-alpine

WORKDIR /app
COPY . .

ENV HOST=0.0.0.0
ENV PORT=8774
EXPOSE 8774

USER node
CMD ["node", "tools/arc_payment_receipt_server.mjs"]

