-- Optional: add the six starter foods without duplicating existing names.
insert into public.foods(name,description,price,image)
select * from (values
  ('Chicken Burger','Juicy chicken burger with fresh vegetables.',220.00,'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'),
  ('Chicken Pizza','Cheesy chicken pizza with herbs and vegetables.',550.00,'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800'),
  ('Fried Chicken','Crispy fried chicken with a delicious coating.',280.00,'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800'),
  ('Pasta','Creamy pasta prepared with chicken and herbs.',320.00,'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800'),
  ('French Fries','Golden crispy fries with a light seasoning.',150.00,'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800'),
  ('Chocolate Cake','Soft chocolate cake with rich chocolate flavor.',180.00,'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800')
) as seed(name,description,price,image)
where not exists (select 1 from public.foods where public.foods.name=seed.name);
