import axios from 'axios';

describe('Social GraphQL', () => {
  it('should serve the health query', async () => {
    const res = await axios.post('/graphql', { query: '{ health }' });

    expect(res.status).toBe(200);
    expect(res.data.errors).toBeUndefined();
    expect(res.data.data).toEqual({ health: 'ok' });
  });
});
