import asyncio
import time
from loguru import logger
from utils.xianyu_utils import trans_cookies, generate_sign


class SecureFreeshipping:
    def __init__(self, session, cookies_str, cookie_id):
        self.session = session
        self.cookies_str = cookies_str
        self.cookie_id = cookie_id
        self.cookies = trans_cookies(cookies_str) if cookies_str else {}
        
        # 这些属性将由主类传递
        self.current_token = None
        self.last_token_refresh_time = None
        self.token_refresh_interval = None

    def _safe_str(self, obj):
        """安全转换为字符串"""
        try:
            return str(obj)
        except:
            return "无法转换的对象"

    async def update_config_cookies(self):
        """更新数据库中的cookies"""
        try:
            from db_manager import db_manager
            
            # 更新数据库中的Cookie
            db_manager.update_config_cookies(self.cookie_id, self.cookies_str)
            logger.debug(f"【{self.cookie_id}】Cookie已更新到数据库")
            
        except Exception as e:
            logger.error(f"【{self.cookie_id}】更新Cookie到数据库失败: {self._safe_str(e)}")

    async def auto_freeshipping(self, order_id, item_id, buyer_id, retry_count=0):
        """自动免拼发货 - 加密版本"""
        if retry_count >= 4:  # 最多重试3次
            logger.error("免拼发货发货失败，重试次数过多")
            return {"error": "免拼发货发货失败，重试次数过多"}

        # 确保session已创建
        if not self.session:
            raise Exception("Session未创建")

        params = {
            'jsv': '2.7.2',
            'appKey': '34839810',
            't': str(int(time.time()) * 1000),
            'sign': '',
            'v': '1.0',
            'type': 'originaljson',
            'accountSite': 'xianyu',
            'dataType': 'json',
            'timeout': '20000',
            'api': 'mtop.idle.groupon.activity.seller.freeshipping',
            'sessionOption': 'AutoLoginOnly',
        }

        data_val = '{"bizOrderId":"' + order_id + '", "itemId":' + item_id + ',"buyerId":' + buyer_id + '}'
        data = {
            'data': data_val,
        }
        
        # 打印参数信息
        logger.info(f"【{self.cookie_id}】免拼发货请求参数: data_val = {data_val}")
        logger.info(f"【{self.cookie_id}】参数详情 - order_id: {order_id}, item_id: {item_id}, buyer_id: {buyer_id}")

        # 始终从最新的cookies中获取_m_h5_tk token（刷新后cookies会被更新）
        token = trans_cookies(self.cookies_str).get('_m_h5_tk', '').split('_')[0] if trans_cookies(self.cookies_str).get('_m_h5_tk') else ''

        if token:
            logger.info(f"使用cookies中的_m_h5_tk token: {token}")
        else:
            logger.warning("cookies中没有找到_m_h5_tk token")

        sign = generate_sign(params['t'], token, data_val)
        params['sign'] = sign

        try:
            logger.info(f"【{self.cookie_id}】开始自动免拼发货，订单ID: {order_id}")
            async with self.session.post(
                'https://h5api.m.goofish.com/h5/mtop.idle.groupon.activity.seller.freeshipping/1.0/',
                params=params,
                data=data
            ) as response:
                res_json = await response.json()

                # 检查并更新Cookie（使用通用工具函数）
                from utils.xianyu_utils import extract_cookies_from_response, is_token_expired_error, is_session_expired_error
                new_cookies = extract_cookies_from_response(response)
                if new_cookies:
                    self.cookies.update(new_cookies)
                    self.cookies_str = '; '.join([f"{k}={v}" for k, v in self.cookies.items()])
                    await self.update_config_cookies()
                    logger.info(f"【{self.cookie_id}】免拼发货接口已从Set-Cookie合并 {len(new_cookies)} 个Cookie字段并更新到数据库")

                logger.info(f"【{self.cookie_id}】自动免拼发货响应: {res_json}")
                
                # 检查响应结果
                ret_value = res_json.get('ret', []) if isinstance(res_json, dict) else []
                
                if ret_value and ret_value[0] == 'SUCCESS::调用成功':
                    logger.info(f"【{self.cookie_id}】✅ 自动免拼发货成功，订单ID: {order_id}")
                    return {"success": True, "order_id": order_id}
                
                # 【令牌过期】使用已更新的Cookie重试（不触发密码登录）
                if is_token_expired_error(ret_value):
                    logger.warning(f"【{self.cookie_id}】免拼发货接口令牌过期，使用新Cookie重试...")
                    await asyncio.sleep(0.5)
                    return await self.auto_freeshipping(order_id, item_id, buyer_id, retry_count + 1)
                
                # 【Session过期】触发密码登录（不阻塞，不重试当前请求）
                if is_session_expired_error(ret_value):
                    logger.warning(f"【{self.cookie_id}】免拼发货接口Session过期，触发密码登录...")
                    # 尝试通过main_instance触发密码登录
                    if hasattr(self, 'main_instance') and self.main_instance and hasattr(self.main_instance, '_try_password_login_refresh'):
                        await self.main_instance._try_password_login_refresh("Session过期(免拼发货)")
                    return {"error": f"Session过期: {ret_value}", "order_id": order_id}
                
                # 其他错误，普通重试
                error_msg = ret_value[0] if ret_value else '未知错误'
                logger.warning(f"【{self.cookie_id}】❌ 自动免拼发货失败: {error_msg}")
                await asyncio.sleep(0.5)
                return await self.auto_freeshipping(order_id, item_id, buyer_id, retry_count + 1)
                    

        except Exception as e:
            logger.error(f"【{self.cookie_id}】自动免拼发货API请求异常: {self._safe_str(e)}")
            await asyncio.sleep(0.5)
            
            # 网络异常也进行重试
            if retry_count < 2:
                logger.info(f"【{self.cookie_id}】网络异常，准备重试...")
                return await self.auto_freeshipping(order_id, item_id, buyer_id, retry_count + 1)
            
            return {"error": f"网络异常: {self._safe_str(e)}", "order_id": order_id}
